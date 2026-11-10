import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import type { EmailLanguage, TriageVerdict } from '../domain/triage.js';

@Entity('emails')
@Index(['runId', 'gmailMessageId'], { unique: true })
export class EmailEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ ...ULID_COLUMN, name: 'run_id' })
  runId: string;

  @Column({ name: 'gmail_message_id', type: 'varchar', length: 64 })
  gmailMessageId: string;

  @Column({ type: 'varchar', length: 998, nullable: true })
  subject: string | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 320, nullable: true })
  senderName: string | null;

  @Column({ name: 'sender_email', type: 'varchar', length: 320 })
  senderEmail: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'attachment_count', type: 'int', default: 0 })
  attachmentCount: number;

  @Column({ type: 'varchar', length: 8, nullable: true })
  language: EmailLanguage | null;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  triage: TriageVerdict;

  @Column({ name: 'triage_reason', type: 'text', nullable: true })
  triageReason: string | null;
}
