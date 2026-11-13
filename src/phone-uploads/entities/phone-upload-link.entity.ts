import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import type { StoredPhoneUploadLinkStatus } from '../domain/phone-upload-link.js';

/** A single-use, 30-minute link (shown as a QR code) that lets the user's phone import invoices. */
@Entity('phone_upload_links')
@Index(['userId'])
export class PhoneUploadLinkEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  /** SHA-256 (hex) of the token in the link, to find the link a phone opened. */
  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  /** The token, AES-256-GCM encrypted, so an open link's URL can be shown again. Null on older links. */
  @Column({ name: 'token_enc', type: 'text', nullable: true })
  tokenEnc: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: StoredPhoneUploadLinkStatus;

  @Column({ ...ULID_COLUMN, name: 'run_id', nullable: true })
  runId: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
