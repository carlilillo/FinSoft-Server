import {
  hashPhoneUploadToken,
  isWellFormedPhoneUploadToken,
  newPhoneUploadToken,
  PHONE_UPLOAD_LINK_TTL_MS,
  PhoneUploadLink,
  PhoneUploadLinkExpiredError,
  PhoneUploadLinkUsedError,
} from './phone-upload-link.js';

const now = new Date('2026-11-12T10:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const newLink = () => PhoneUploadLink.create({ id: 'link-1', userId: 'user_1', tokenHash: 'hash', now });

describe('PhoneUploadLink', () => {
  it('opens for 30 minutes', () => {
    const link = newLink();
    expect(link.toState()).toMatchObject({ status: 'open', runId: null, usedAt: null });
    expect(link.toState().expiresAt).toEqual(later(PHONE_UPLOAD_LINK_TTL_MS));
    expect(link.statusAt(later(PHONE_UPLOAD_LINK_TTL_MS - 1))).toBe('open');
  });

  it('expires exactly 30 minutes after it was created', () => {
    const link = newLink();
    expect(link.statusAt(later(PHONE_UPLOAD_LINK_TTL_MS))).toBe('expired');
    expect(() => link.assertOpen(later(PHONE_UPLOAD_LINK_TTL_MS))).toThrow(PhoneUploadLinkExpiredError);
  });

  it('is disabled once the phone sends its invoices', () => {
    const link = newLink();
    link.markUsed('run-1', later(60_000));
    expect(link.toState()).toMatchObject({ status: 'used', runId: 'run-1', usedAt: later(60_000) });
    expect(() => link.assertOpen(later(61_000))).toThrow(PhoneUploadLinkUsedError);
    expect(() => link.markUsed('run-2', later(62_000))).toThrow(PhoneUploadLinkUsedError);
  });

  it('stays "used" after its expiry so the computer can still follow the session', () => {
    const link = newLink();
    link.markUsed('run-1', later(60_000));
    expect(link.statusAt(later(PHONE_UPLOAD_LINK_TTL_MS * 2))).toBe('used');
  });

  it('cannot be used after it expired', () => {
    expect(() => newLink().markUsed('run-1', later(PHONE_UPLOAD_LINK_TTL_MS))).toThrow(PhoneUploadLinkExpiredError);
  });
});

describe('phone upload tokens', () => {
  it('are unique, URL-safe and well formed', () => {
    const first = newPhoneUploadToken();
    expect(first).not.toBe(newPhoneUploadToken());
    expect(isWellFormedPhoneUploadToken(first)).toBe(true);
  });

  it('rejects anything that is not a token', () => {
    expect(isWellFormedPhoneUploadToken('')).toBe(false);
    expect(isWellFormedPhoneUploadToken('../../etc/passwd')).toBe(false);
    expect(isWellFormedPhoneUploadToken('a'.repeat(44))).toBe(false);
  });

  it('are stored as a stable SHA-256 hash', () => {
    const token = newPhoneUploadToken();
    expect(hashPhoneUploadToken(token)).toBe(hashPhoneUploadToken(token));
    expect(hashPhoneUploadToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPhoneUploadToken(token)).not.toContain(token);
  });
});
