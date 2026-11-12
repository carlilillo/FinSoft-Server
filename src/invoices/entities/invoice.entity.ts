import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { bigintToNumber, CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import { InvoiceLineEntity } from './invoice-line.entity.js';
import { VendorEntity } from './vendor.entity.js';
import type { InvoiceLanguage } from '../domain/invoice.js';

@Entity('invoices')
@Index(['userId', 'issueDate'])
@Index(['userId', 'vendorId', 'invoiceNumber'], {
  unique: true,
  where: '"invoice_number" IS NOT NULL',
})
export class InvoiceEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  /** The extraction session (analysis run) that extracted this invoice. */
  @Column({ ...ULID_COLUMN, name: 'run_id', nullable: true })
  runId: string | null;

  @Column({ ...ULID_COLUMN, name: 'email_id', nullable: true })
  emailId: string | null;

  /** Gmail account the invoice's email arrived in; null for imported invoices. */
  @Column({ ...ULID_COLUMN, name: 'gmail_connection_id', nullable: true })
  gmailConnectionId: string | null;

  /** Imported document (PDF or image) the invoice was read from (manual imports have no email). */
  @Column({ ...ULID_COLUMN, name: 'import_file_id', nullable: true })
  importFileId: string | null;

  @Column({ ...ULID_COLUMN, name: 'vendor_id' })
  vendorId: string;

  @ManyToOne(() => VendorEntity, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: Relation<VendorEntity>;

  @Column({
    name: 'invoice_number',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  invoiceNumber: string | null;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    name: 'subtotal_cents',
    type: 'bigint',
    transformer: bigintToNumber,
  })
  subtotalCents: number;

  @Column({ name: 'vat_cents', type: 'bigint', transformer: bigintToNumber })
  vatCents: number;

  @Column({
    name: 'withholding_cents',
    type: 'bigint',
    nullable: true,
    transformer: bigintToNumber,
  })
  withholdingCents: number | null;

  @Column({ name: 'total_cents', type: 'bigint', transformer: bigintToNumber })
  totalCents: number;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  paymentMethod: string | null;

  @Column({ type: 'varchar', length: 8 })
  language: InvoiceLanguage;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => InvoiceLineEntity, (line) => line.invoice)
  lines?: Relation<InvoiceLineEntity[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
