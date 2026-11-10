import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../common/domain/domain-error.js';

export class InvalidOAuthStateError extends DomainError {
  readonly code = 'INVALID_OAUTH_STATE';
  constructor(reason: string) {
    super(`The Google sign-in link is invalid or expired (${reason}). Start the connection again.`);
  }
}

export class GmailNotConnectedError extends DomainError {
  readonly code = 'GMAIL_NOT_CONNECTED';
  constructor() {
    super('Connect your Gmail account before running an analysis');
  }
}

export interface OAuthStatePayload {
  userId: string;
  nonce: string;
  exp: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;

/** Signed, short-lived OAuth `state`: binds the Google callback to the Clerk user who started it. */
export function signOAuthState(userId: string, secret: string, now: Date): string {
  const payload: OAuthStatePayload = { userId, nonce: randomBytes(12).toString('hex'), exp: now.getTime() + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyOAuthState(state: string, secret: string, now: Date): OAuthStatePayload {
  const [body, signature] = state.split('.');
  if (!body || !signature) throw new InvalidOAuthStateError('malformed');

  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new InvalidOAuthStateError('bad signature');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  if (payload.exp < now.getTime()) throw new InvalidOAuthStateError('expired');
  return payload;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}
