import { NotFoundException } from '@nestjs/common';
import type { AnalysisService } from '../analysis/analysis.service.js';
import { RunLimitReachedError } from '../analysis/domain/analysis-run.errors.js';
import type { TokenCipherService } from '../common/crypto/token-cipher.service.js';
import type { AppConfigService } from '../config/app-config.service.js';
import type { IncomingFile } from '../imports/domain/import-file.js';
import {
  hashPhoneUploadToken,
  PhoneUploadLinkExpiredError,
  type PhoneUploadLinkState,
  PhoneUploadLinkUsedError,
} from './domain/phone-upload-link.js';
import type { PhoneUploadLinkEntity } from './entities/phone-upload-link.entity.js';
import type { PhoneUploadLinksRepository } from './phone-upload-links.repository.js';
import { PhoneUploadsService } from './phone-uploads.service.js';

const files: IncomingFile[] = [
  { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 4, bytes: new Uint8Array([37, 80, 68, 70]) },
];
const START = new Date('2026-11-12T10:00:00Z');
const minutes = (count: number) => new Date(START.getTime() + count * 60_000);

/** An in-memory links table that behaves like the repository: per-user reuse, save only on success. */
function setup() {
  const rows = new Map<string, PhoneUploadLinkState>();
  const asEntity = (row: PhoneUploadLinkState | undefined) => (row as PhoneUploadLinkEntity | undefined) ?? null;
  const links = {
    reuseOrCreate: vi.fn(
      (userId: string, now: Date, choose: (open: PhoneUploadLinkState[]) => PhoneUploadLinkState) => {
        const open = [...rows.values()].filter(
          (row) => row.userId === userId && row.status === 'open' && row.expiresAt > now,
        );
        const chosen = choose(open);
        rows.set(chosen.tokenHash, chosen);
        return Promise.resolve(chosen);
      },
    ),
    findByTokenHash: vi.fn((hash: string) => Promise.resolve(asEntity(rows.get(hash)))),
    findOwned: vi.fn(),
    useExclusively: vi.fn(
      async (hash: string, use: (link: PhoneUploadLinkEntity | null) => Promise<PhoneUploadLinkState>) => {
        const next = await use(asEntity(rows.get(hash)));
        rows.set(hash, next);
        return next;
      },
    ),
  };
  const analysis = { importDocuments: vi.fn().mockResolvedValue({ runId: 'run-1' }) };
  const config = { get: vi.fn().mockReturnValue('https://app.finsift.test') };
  const cipher = {
    encrypt: (plain: string) => `enc:${[...plain].reverse().join('')}`,
    decrypt: (payload: string) => [...payload.slice(4)].reverse().join(''),
  };
  const service = new PhoneUploadsService(
    links as unknown as PhoneUploadLinksRepository,
    analysis as unknown as AnalysisService,
    config as unknown as AppConfigService,
    cipher as unknown as TokenCipherService,
  );
  const tokenOf = (url: string) => new URL(url).pathname.split('/').at(-1) ?? '';
  const row = (token: string) => rows.get(hashPhoneUploadToken(token));
  return { service, analysis, tokenOf, row, rows };
}

describe('PhoneUploadsService', () => {
  beforeEach(() => vi.useFakeTimers({ now: START }));
  afterEach(() => vi.useRealTimers());

  describe('createOrReuse', () => {
    it('creates a link on the client app and stores its token only hashed and encrypted', async () => {
      const { service, tokenOf, row } = setup();
      const { url } = await service.createOrReuse('user_1');
      expect(url).toMatch(/^https:\/\/app\.finsift\.test\/upload\/[A-Za-z0-9_-]{43}$/);
      const stored = row(tokenOf(url));
      expect(stored).toMatchObject({ userId: 'user_1', status: 'open' });
      expect(stored?.tokenEnc).not.toContain(tokenOf(url));
    });

    it('shows the same link again while it is open, instead of creating another one', async () => {
      const { service, rows } = setup();
      const first = await service.createOrReuse('user_1');
      vi.setSystemTime(minutes(10));
      const again = await service.createOrReuse('user_1');
      expect(again).toEqual(first);
      expect(rows.size).toBe(1);
    });

    it("never shows another user's link", async () => {
      const { service, rows } = setup();
      const mine = await service.createOrReuse('user_1');
      const theirs = await service.createOrReuse('user_2');
      expect(theirs.url).not.toBe(mine.url);
      expect(rows.size).toBe(2);
    });

    it('creates a new link when the open one has less than 5 minutes left', async () => {
      const { service, rows } = setup();
      const first = await service.createOrReuse('user_1');
      vi.setSystemTime(minutes(26));
      const next = await service.createOrReuse('user_1');
      expect(next.id).not.toBe(first.id);
      expect(next.expiresAt).toEqual(minutes(56));
      expect(rows.size).toBe(2);
    });

    it('creates a new link once the previous one was used', async () => {
      const { service, tokenOf } = setup();
      const first = await service.createOrReuse('user_1');
      await service.submit(tokenOf(first.url), files);
      const next = await service.createOrReuse('user_1');
      expect(next.id).not.toBe(first.id);
    });

    it('does not reuse older links whose token was never stored', async () => {
      const { service, rows } = setup();
      const first = await service.createOrReuse('user_1');
      for (const [hash, row] of rows) rows.set(hash, { ...row, tokenEnc: null });
      const next = await service.createOrReuse('user_1');
      expect(next.id).not.toBe(first.id);
    });
  });

  it("imports the phone's files for the link's owner and disables the link", async () => {
    const { service, analysis, tokenOf, row } = setup();
    const token = tokenOf((await service.createOrReuse('user_1')).url);

    await expect(service.submit(token, files)).resolves.toEqual({ runId: 'run-1' });
    expect(analysis.importDocuments).toHaveBeenCalledWith('user_1', files);
    expect(row(token)).toMatchObject({ status: 'used', runId: 'run-1' });

    await expect(service.describe(token)).rejects.toThrow(PhoneUploadLinkUsedError);
    await expect(service.submit(token, files)).rejects.toThrow(PhoneUploadLinkUsedError);
    expect(analysis.importDocuments).toHaveBeenCalledTimes(1);
  });

  it('keeps the link open when the import is refused, so the phone can retry', async () => {
    const { service, analysis, tokenOf, row } = setup();
    const token = tokenOf((await service.createOrReuse('user_1')).url);
    analysis.importDocuments.mockRejectedValueOnce(new RunLimitReachedError(3));

    await expect(service.submit(token, files)).rejects.toThrow(RunLimitReachedError);
    expect(row(token)).toMatchObject({ status: 'open', runId: null });
    await expect(service.describe(token)).resolves.toHaveProperty('expiresAt');
  });

  it('refuses an expired link, 30 minutes after it was created', async () => {
    const { service, analysis, tokenOf } = setup();
    const token = tokenOf((await service.createOrReuse('user_1')).url);

    vi.setSystemTime(minutes(30));
    await expect(service.describe(token)).rejects.toThrow(PhoneUploadLinkExpiredError);
    await expect(service.submit(token, files)).rejects.toThrow(PhoneUploadLinkExpiredError);
    expect(analysis.importDocuments).not.toHaveBeenCalled();
  });

  it('answers 404 for tokens it never issued', async () => {
    const { service } = setup();
    await expect(service.describe('not-a-token')).rejects.toThrow(NotFoundException);
    await expect(service.submit('a'.repeat(43), files)).rejects.toThrow(NotFoundException);
  });
});
