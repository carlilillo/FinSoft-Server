import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { newId } from '../database/ids.js';
import type { IncomingFile } from '../imports/domain/import-file.js';
import {
  hashPhoneUploadToken,
  isWellFormedPhoneUploadToken,
  newPhoneUploadToken,
  PhoneUploadLink,
  type PhoneUploadLinkState,
} from './domain/phone-upload-link.js';
import { PhoneUploadLinksRepository } from './phone-upload-links.repository.js';

/** The page the QR code opens on the phone; the token in its path is the link's only credential. */
const PHONE_UPLOAD_PATH = '/upload';

@Injectable()
export class PhoneUploadsService {
  constructor(
    private readonly links: PhoneUploadLinksRepository,
    private readonly analysis: AnalysisService,
    private readonly config: AppConfigService,
  ) {}

  /** A fresh single-use link for the computer to show as a QR code. The token is returned only here. */
  async create(userId: string): Promise<{ id: string; url: string; expiresAt: Date }> {
    const token = newPhoneUploadToken();
    const link = PhoneUploadLink.create({
      id: newId(),
      userId,
      tokenHash: hashPhoneUploadToken(token),
      now: new Date(),
    }).toState();
    await this.links.insert(link);
    return { id: link.id, url: this.urlFor(token), expiresAt: link.expiresAt };
  }

  /** Polled by the computer while the QR code is shown, to follow the phone into the session it starts. */
  async status(userId: string, id: string) {
    const entity = await this.links.findOwned(userId, id);
    if (!entity) throw new NotFoundException(`Phone upload link ${id} not found`);
    return {
      id: entity.id,
      status: PhoneUploadLink.from(entity).statusAt(new Date()),
      runId: entity.runId,
      expiresAt: entity.expiresAt,
    };
  }

  /** The phone opened the link: it may pick invoices only while the link is open. */
  async describe(token: string): Promise<{ expiresAt: Date }> {
    const entity = await this.findByToken(token);
    PhoneUploadLink.from(entity).assertOpen(new Date());
    return { expiresAt: entity.expiresAt };
  }

  /**
   * The phone sends its invoices: they start an extraction session for the link's owner, exactly as an
   * import from the computer would, and the link is disabled. If the import is refused (unsupported
   * file, too many analyses running…) the link stays open so the phone can try again.
   */
  async submit(token: string, files: IncomingFile[]): Promise<{ runId: string }> {
    if (!isWellFormedPhoneUploadToken(token)) throw linkNotFound();
    const used = await this.links.useExclusively(hashPhoneUploadToken(token), async (entity) => {
      if (!entity) throw linkNotFound();
      const link = PhoneUploadLink.from(entity);
      const now = new Date();
      link.assertOpen(now);
      const { runId } = await this.analysis.importDocuments(entity.userId, files);
      link.markUsed(runId, now);
      return link.toState();
    });
    return { runId: requireRunId(used) };
  }

  private async findByToken(token: string) {
    if (!isWellFormedPhoneUploadToken(token)) throw linkNotFound();
    const entity = await this.links.findByTokenHash(hashPhoneUploadToken(token));
    if (!entity) throw linkNotFound();
    return entity;
  }

  private urlFor(token: string): string {
    return new URL(`${PHONE_UPLOAD_PATH}/${token}`, this.config.get('CLIENT_URL')).toString();
  }
}

function linkNotFound(): NotFoundException {
  return new NotFoundException('This upload link is not valid. Scan the QR code on your computer again.');
}

function requireRunId(link: PhoneUploadLinkState): string {
  if (!link.runId) throw new Error(`Phone upload link ${link.id} was used without a session`);
  return link.runId;
}
