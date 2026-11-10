import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { newId } from '../database/ids.js';
import { StorageService } from '../storage/storage.service.js';
import { buildDocumentKey, type DocumentSource } from './domain/invoice-document.js';
import { InvoiceDocumentEntity } from './entities/invoice-document.entity.js';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(InvoiceDocumentEntity) private readonly documents: Repository<InvoiceDocumentEntity>,
    private readonly storage: StorageService,
  ) {}

  /** Stores the original document an invoice was read from. Same bytes on the same invoice are stored once. */
  async storeOriginal(props: {
    source: DocumentSource;
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
      source: props.source,
    });
    return { documentId: id, duplicate: false };
  }

  async downloadUrl(userId: string, documentId: string) {
    const document = await this.documents.findOne({ where: { id: documentId, userId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    return { url: await this.storage.presignDownload(document.s3Key, document.fileName), expiresInSeconds: 300 };
  }
}
