import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintToNumber, CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import type { DocumentSource, DocumentStatus } from '../domain/invoice-document.js';

@Entity('invoice_documents')
@Index(['invoiceId', 'sha256'], { unique: true, where: '"sha256" IS NOT NULL' })
export class InvoiceDocumentEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...ULID_COLUMN, name: 'invoice_id' })
  invoiceId: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ name: 's3_key', type: 'varchar', length: 1024 })
  s3Key: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 127 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint', transformer: bigintToNumber })
  sizeBytes: number;

  /** Null until a presigned upload is confirmed (agent uploads hash immediately). */
  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @Column({ type: 'varchar', length: 16 })
  source: DocumentSource;

  @Column({ type: 'varchar', length: 16 })
  status: DocumentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
