import { createHash, randomBytes } from 'node:crypto';
import { DomainError } from '../../common/domain/domain-error.js';

/** A phone upload link works for 30 minutes after the QR code is shown, and only once. */
export const PHONE_UPLOAD_LINK_TTL_MS = 30 * 60 * 1000;

/** What is stored: a link is open until the phone sends its invoices. Expiry is derived from `expiresAt`. */
export type StoredPhoneUploadLinkStatus = 'open' | 'used';

/** What the computer and the phone see. */
export type PhoneUploadLinkStatus = 'open' | 'expired' | 'used';

export interface PhoneUploadLinkState {
  id: string;
  userId: string;
  /** SHA-256 of the token in the URL; the token itself is never stored. */
  tokenHash: string;
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

  static create(params: { id: string; userId: string; tokenHash: string; now: Date }): PhoneUploadLink {
    return new PhoneUploadLink({
      id: params.id,
      userId: params.userId,
      tokenHash: params.tokenHash,
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
