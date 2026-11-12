import { NotFoundException } from '@nestjs/common';
import type { AnalysisService } from '../analysis/analysis.service.js';
import type { AppConfigService } from '../config/app-config.service.js';
import { RunLimitReachedError } from '../analysis/domain/analysis-run.errors.js';
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

/** An in-memory stand-in for the links table that behaves like `useExclusively`: save only on success. */
function setup() {
  const rows = new Map<string, PhoneUploadLinkState>();
  const links = {
    insert: vi.fn((link: PhoneUploadLinkState) => {
      rows.set(link.tokenHash, link);
      return Promise.resolve();
    }),
    findByTokenHash: vi.fn((hash: string) => Promise.resolve((rows.get(hash) as PhoneUploadLinkEntity) ?? null)),
    findOwned: vi.fn(),
    useExclusively: vi.fn(
      async (hash: string, use: (link: PhoneUploadLinkEntity | null) => Promise<PhoneUploadLinkState>) => {
        const next = await use((rows.get(hash) as PhoneUploadLinkEntity) ?? null);
        rows.set(hash, next);
        return next;
      },
    ),
  };
  const analysis = { importDocuments: vi.fn().mockResolvedValue({ runId: 'run-1' }) };
  const config = { get: vi.fn().mockReturnValue('https://app.finsift.test') };
  const service = new PhoneUploadsService(
    links as unknown as PhoneUploadLinksRepository,
    analysis as unknown as AnalysisService,
    config as unknown as AppConfigService,
  );
  const tokenOf = (url: string) => new URL(url).pathname.split('/').at(-1) ?? '';
  const row = (token: string) => rows.get(hashPhoneUploadToken(token));
  return { service, analysis, tokenOf, row };
}

describe('PhoneUploadsService', () => {
  afterEach(() => vi.useRealTimers());

  it('creates a link on the client app and stores only the hash of its token', async () => {
    const { service, tokenOf, row } = setup();
    const { url } = await service.create('user_1');
    expect(url).toMatch(/^https:\/\/app\.finsift\.test\/upload\/[A-Za-z0-9_-]{43}$/);
    const stored = row(tokenOf(url));
    expect(stored).toMatchObject({ userId: 'user_1', status: 'open' });
    expect(JSON.stringify(stored)).not.toContain(tokenOf(url));
  });

  it("imports the phone's files for the link's owner and disables the link", async () => {
    const { service, analysis, tokenOf, row } = setup();
    const token = tokenOf((await service.create('user_1')).url);

    await expect(service.submit(token, files)).resolves.toEqual({ runId: 'run-1' });
    expect(analysis.importDocuments).toHaveBeenCalledWith('user_1', files);
    expect(row(token)).toMatchObject({ status: 'used', runId: 'run-1' });

    await expect(service.describe(token)).rejects.toThrow(PhoneUploadLinkUsedError);
    await expect(service.submit(token, files)).rejects.toThrow(PhoneUploadLinkUsedError);
    expect(analysis.importDocuments).toHaveBeenCalledTimes(1);
  });

  it('keeps the link open when the import is refused, so the phone can retry', async () => {
    const { service, analysis, tokenOf, row } = setup();
    const token = tokenOf((await service.create('user_1')).url);
    analysis.importDocuments.mockRejectedValueOnce(new RunLimitReachedError(3));

    await expect(service.submit(token, files)).rejects.toThrow(RunLimitReachedError);
    expect(row(token)).toMatchObject({ status: 'open', runId: null });
    await expect(service.describe(token)).resolves.toHaveProperty('expiresAt');
  });

  it('refuses an expired link, 30 minutes after it was created', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-12T10:00:00Z') });
    const { service, analysis, tokenOf } = setup();
    const token = tokenOf((await service.create('user_1')).url);

    vi.setSystemTime(new Date('2026-11-12T10:30:00Z'));
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
