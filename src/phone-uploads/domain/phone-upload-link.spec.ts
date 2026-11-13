import {
  findReusableLink,
  hashPhoneUploadToken,
  isWellFormedPhoneUploadToken,
  newPhoneUploadToken,
  PHONE_UPLOAD_LINK_MIN_REUSE_MS,
  PHONE_UPLOAD_LINK_TTL_MS,
  PhoneUploadLink,
  PhoneUploadLinkExpiredError,
  PhoneUploadLinkUsedError,
} from './phone-upload-link.js';

const now = new Date('2026-11-12T10:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const newLink = (id = 'link-1', createdAt = now) =>
  PhoneUploadLink.create({ id, userId: 'user_1', tokenHash: `hash-${id}`, tokenEnc: `enc-${id}`, now: createdAt });

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

describe('reusing an open link', () => {
  const lastReusableMoment = later(PHONE_UPLOAD_LINK_TTL_MS - PHONE_UPLOAD_LINK_MIN_REUSE_MS);

  it('is allowed while at least 5 minutes of the link are left', () => {
    expect(newLink().isReusableAt(now)).toBe(true);
    expect(newLink().isReusableAt(lastReusableMoment)).toBe(true);
    expect(newLink().isReusableAt(later(PHONE_UPLOAD_LINK_TTL_MS - PHONE_UPLOAD_LINK_MIN_REUSE_MS + 1))).toBe(false);
  });

  it('is never allowed for used or expired links', () => {
    const used = newLink();
    used.markUsed('run-1', now);
    expect(used.isReusableAt(now)).toBe(false);
    expect(newLink().isReusableAt(later(PHONE_UPLOAD_LINK_TTL_MS))).toBe(false);
  });

  it('is never allowed for links whose token was not stored', () => {
    const legacy = PhoneUploadLink.from({ ...newLink().toState(), tokenEnc: null });
    expect(legacy.isReusableAt(now)).toBe(false);
  });

  it('picks the reusable link with the most time left', () => {
    const older = newLink('older', now).toState();
    const newer = newLink('newer', later(60_000)).toState();
    const legacy = { ...newLink('legacy', later(120_000)).toState(), tokenEnc: null };
    expect(findReusableLink([older, legacy, newer], later(90_000))?.id).toBe('newer');
  });

  it('finds nothing when every link is too close to its expiry', () => {
    expect(findReusableLink([newLink().toState()], later(PHONE_UPLOAD_LINK_TTL_MS - 60_000))).toBeNull();
    expect(findReusableLink([], now)).toBeNull();
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
