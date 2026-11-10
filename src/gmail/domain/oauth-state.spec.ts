import { InvalidOAuthStateError, signOAuthState, verifyOAuthState } from './oauth-state.js';

const secret = 'x'.repeat(32);
const now = new Date('2026-11-09T10:00:00Z');

describe('OAuth state', () => {
  it('round-trips the user id and what the user was doing', () => {
    const state = signOAuthState('user_abc', 'connect', secret, now);
    expect(verifyOAuthState(state, secret, now)).toMatchObject({ userId: 'user_abc', intent: 'connect' });
    expect(verifyOAuthState(signOAuthState('user_abc', 'analyze', secret, now), secret, now).intent).toBe('analyze');
  });

  it('rejects tampering, other secrets and expiry', () => {
    const state = signOAuthState('user_abc', 'analyze', secret, now);
    const [body, signature] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 'user_evil', intent: 'analyze', nonce: 'n', exp: now.getTime() + 1000 })).toString('base64url');
    expect(() => verifyOAuthState(`${forged}.${signature}`, secret, now)).toThrow(InvalidOAuthStateError);
    expect(() => verifyOAuthState(`${body}.${signature}`, 'y'.repeat(32), now)).toThrow(InvalidOAuthStateError);
    expect(() => verifyOAuthState(state, secret, new Date(now.getTime() + 11 * 60_000))).toThrow(/expired/);
  });
});
