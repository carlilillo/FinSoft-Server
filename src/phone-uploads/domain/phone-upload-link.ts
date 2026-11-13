import { createHash, randomBytes } from 'node:crypto';
import { DomainError } from '../../common/domain/domain-error.js';

/** A phone upload link works for 30 minutes after the QR code is shown, and only once. */
export const PHONE_UPLOAD_LINK_TTL_MS = 30 * 60 * 1000;

/**
 * Showing the QR code again reuses the user's open link instead of creating one more, but only while
 * enough of it is left to scan the code and pick the files; closer to its expiry a new link is created.
 */
export const PHONE_UPLOAD_LINK_MIN_REUSE_MS = 5 * 60 * 1000;

/** What is stored: a link is open until the phone sends its invoices. Expiry is derived from `expiresAt`. */
export type StoredPhoneUploadLinkStatus = 'open' | 'used';

/** What the computer and the phone see. */
export type PhoneUploadLinkStatus = 'open' | 'expired' | 'used';

export interface PhoneUploadLinkState {
  id: string;
  userId: string;
  /** SHA-256 of the token in the URL, to find the link the phone opened. */
  tokenHash: string;
  /**
   * The token encrypted at rest, so the same URL can be shown again while the link is open. Null for
   * links created before links were reused: those can't be shown again.
   */
  tokenEnc: string | null;
  status: StoredPhoneUploadLinkStatus;
  /** The extraction session the phone's invoices started, once they are sent. */
  runId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
}

export class PhoneUploadLinkExpiredError extends DomainError {
  readonly code = 'PHONE_UPLOAD_LINK_EXPIRED';
  constructor() {
    super('This upload link has expired. Create a new QR code on your computer and scan it again.');
  }
}

export class PhoneUploadLinkUsedError extends DomainError {
  readonly code = 'PHONE_UPLOAD_LINK_USED';
  constructor() {
    super('The invoices for this link were already sent. Create a new QR code on your computer to send more.');
  }
}

/** 256 random bits, URL-safe: the only secret that gives a phone access to the user's import. */
export function newPhoneUploadToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPhoneUploadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Rejects anything that can't be a token before it reaches the database (43 base64url characters). */
export function isWellFormedPhoneUploadToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export class PhoneUploadLink {
  private constructor(private state: PhoneUploadLinkState) {}

  static create(params: {
    id: string;
    userId: string;
    tokenHash: string;
    tokenEnc: string;
    now: Date;
  }): PhoneUploadLink {
    return new PhoneUploadLink({
      id: params.id,
      userId: params.userId,
      tokenHash: params.tokenHash,
      tokenEnc: params.tokenEnc,
      status: 'open',
      runId: null,
      expiresAt: new Date(params.now.getTime() + PHONE_UPLOAD_LINK_TTL_MS),
      usedAt: null,
    });
  }

  static from(state: PhoneUploadLinkState): PhoneUploadLink {
    return new PhoneUploadLink({ ...state });
  }

  /** A used link stays "used" after it expires, so the computer still learns which session it started. */
  statusAt(now: Date): PhoneUploadLinkStatus {
    if (this.state.status === 'used') return 'used';
    return now.getTime() >= this.state.expiresAt.getTime() ? 'expired' : 'open';
  }

  /** Open, its URL can be rebuilt, and it still has at least PHONE_UPLOAD_LINK_MIN_REUSE_MS to live. */
  isReusableAt(now: Date): boolean {
    return (
      this.statusAt(now) === 'open' &&
      this.state.tokenEnc !== null &&
      this.state.expiresAt.getTime() - now.getTime() >= PHONE_UPLOAD_LINK_MIN_REUSE_MS
    );
  }

  /** The phone may open the page and send invoices only while the link is open. */
  assertOpen(now: Date): void {
    const status = this.statusAt(now);
    if (status === 'used') throw new PhoneUploadLinkUsedError();
    if (status === 'expired') throw new PhoneUploadLinkExpiredError();
  }

  /** The phone's invoices started `runId`: the link is disabled for good. */
  markUsed(runId: string, now: Date): void {
    this.assertOpen(now);
    this.state = { ...this.state, status: 'used', runId, usedAt: now };
  }

  toState(): PhoneUploadLinkState {
    return { ...this.state };
  }
}

/** The user's link to show again, if any: the reusable one with the most time left. */
export function findReusableLink(links: PhoneUploadLinkState[], now: Date): PhoneUploadLinkState | null {
  const reusable = links.filter((link) => PhoneUploadLink.from(link).isReusableAt(now));
  return reusable.toSorted((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0] ?? null;
}
