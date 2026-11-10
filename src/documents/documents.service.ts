import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { newId } from '../database/ids.js';
import { toDocumentView } from '../invoices/dto/invoice.views.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';
import { StorageService } from '../storage/storage.service.js';
import { assertConfirmable, assertUploadAllowed, buildDocumentKey } from './domain/invoice-document.js';
import type { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';
import { InvoiceDocumentEntity } from './entities/invoice-document.entity.js';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(InvoiceDocumentEntity) private readonly documents: Repository<InvoiceDocumentEntity>,
    private readonly invoices: InvoicesRepository,
    private readonly storage: StorageService,
  ) {}

  /** Server-side upload used by the extraction agent. Same bytes on the same invoice are stored once. */
  async storeFromEmail(props: {
    userId: string;
    invoiceId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ documentId: string; duplicate: boolean }> {
    const sha256 = createHash('sha256').update(props.bytes).digest('hex');
    const existing = await this.documents.findOne({ where: { invoiceId: props.invoiceId, sha256 } });
    if (existing) return { documentId: existing.id, duplicate: true };

    const id = newId();
    const s3Key = buildDocumentKey({ userId: props.userId, invoiceId: props.invoiceId, documentId: id, fileName: props.fileName });
    await this.storage.putObject(s3Key, props.bytes, props.mimeType);
    await this.documents.insert({
      id,
      invoiceId: props.invoiceId,
      userId: props.userId,
      s3Key,
      fileName: props.fileName,
      mimeType: props.mimeType,
      sizeBytes: props.bytes.byteLength,
      sha256,
      source: 'email',
      status: 'available',
    });
    return { documentId: id, duplicate: false };
  }

  async createUploadUrl(userId: string, dto: CreateUploadUrlDto) {
    const invoice = await this.invoices.findOwned(userId, dto.invoiceId);
    if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);
    assertUploadAllowed({ mimeType: dto.contentType, sizeBytes: dto.sizeBytes });

    const id = newId();
    const s3Key = buildDocumentKey({ userId, invoiceId: invoice.id, documentId: id, fileName: dto.fileName });
    await this.documents.insert({
      id,
      invoiceId: invoice.id,
      userId,
      s3Key,
      fileName: dto.fileName,
      mimeType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      sha256: null,
      source: 'upload',
      status: 'pending_upload',
    });
    const uploadUrl = await this.storage.presignUpload(s3Key, dto.contentType, dto.sizeBytes);
    return { documentId: id, uploadUrl, method: 'PUT' as const, headers: { 'Content-Type': dto.contentType } };
  }

  async confirmUpload(userId: string, documentId: string) {
    const document = await this.findOwned(userId, documentId);
    assertConfirmable(document.status);
    const size = await this.storage.getObjectSize(document.s3Key);
    if (size === null) throw new BadRequestException('The file has not been uploaded yet');

    document.status = 'available';
    document.sizeBytes = size;
    await this.documents.save(document);
    return toDocumentView(document);
  }

  async downloadUrl(userId: string, documentId: string) {
    const document = await this.findOwned(userId, documentId);
    if (document.status !== 'available') throw new NotFoundException(`Document ${documentId} not found`);
    return { url: await this.storage.presignDownload(document.s3Key, document.fileName), expiresInSeconds: 300 };
  }

  private async findOwned(userId: string, documentId: string): Promise<InvoiceDocumentEntity> {
    const document = await this.documents.findOne({ where: { id: documentId, userId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    return document;
  }
}
