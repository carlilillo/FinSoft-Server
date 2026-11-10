import { InvalidOAuthStateError, signOAuthState, verifyOAuthState } from './oauth-state.js';

const secret = 'x'.repeat(32);
const now = new Date('2026-11-09T10:00:00Z');

describe('OAuth state', () => {
  it('round-trips the user id', () => {
    const state = signOAuthState('user_abc', secret, now);
    expect(verifyOAuthState(state, secret, now).userId).toBe('user_abc');
  });

  it('rejects tampering, other secrets and expiry', () => {
    const state = signOAuthState('user_abc', secret, now);
    const [body, signature] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 'user_evil', nonce: 'n', exp: now.getTime() + 1000 })).toString('base64url');
    expect(() => verifyOAuthState(`${forged}.${signature}`, secret, now)).toThrow(InvalidOAuthStateError);
    expect(() => verifyOAuthState(`${body}.${signature}`, 'y'.repeat(32), now)).toThrow(InvalidOAuthStateError);
    expect(() => verifyOAuthState(state, secret, new Date(now.getTime() + 11 * 60_000))).toThrow(/expired/);
  });
});
