import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service.js';
import { TokenCipherService } from '../common/crypto/token-cipher.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { newId } from '../database/ids.js';
import type { IncomingFile } from '../imports/domain/import-file.js';
import {
  findReusableLink,
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
    private readonly cipher: TokenCipherService,
  ) {}

  /**
   * The link for the computer to show as a QR code. While the user has an open link with enough time
   * left, that same link (same URL, same expiry) is shown again; otherwise a new one is created.
   */
  async createOrReuse(userId: string): Promise<{ id: string; url: string; expiresAt: Date }> {
    const now = new Date();
    const link = await this.links.reuseOrCreate(
      userId,
      now,
      (open) => findReusableLink(open, now) ?? this.newLink(userId, now),
    );
    return { id: link.id, url: this.urlFor(this.cipher.decrypt(requireTokenEnc(link))), expiresAt: link.expiresAt };
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

  private newLink(userId: string, now: Date): PhoneUploadLinkState {
    const token = newPhoneUploadToken();
    return PhoneUploadLink.create({
      id: newId(),
      userId,
      tokenHash: hashPhoneUploadToken(token),
      tokenEnc: this.cipher.encrypt(token),
      now,
    }).toState();
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

/** Reused links are chosen among those with a stored token, and new ones always have one. */
function requireTokenEnc(link: PhoneUploadLinkState): string {
  if (!link.tokenEnc) throw new Error(`Phone upload link ${link.id} has no stored token`);
  return link.tokenEnc;
}

function requireRunId(link: PhoneUploadLinkState): string {
  if (!link.runId) throw new Error(`Phone upload link ${link.id} was used without a session`);
  return link.runId;
}
