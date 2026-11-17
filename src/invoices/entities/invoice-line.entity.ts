import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { numericToNumber, ULID_COLUMN } from '../../database/column-types.js';
import { ProductEntity } from '../../products/entities/product.entity.js';
import type { Amount } from '../domain/money.js';
import { InvoiceEntity } from './invoice.entity.js';

@Entity('invoice_lines')
export class InvoiceLineEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...ULID_COLUMN, name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: Relation<InvoiceEntity>;

  @Column({ ...ULID_COLUMN, name: 'product_id' })
  productId: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'product_id' })
  product?: Relation<ProductEntity>;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'numeric', precision: 20, scale: 6, transformer: numericToNumber })
  quantity: number;

  /** Money columns are exact `numeric`; pg returns them as decimal strings, never floats. */
  @Column({ name: 'unit_price_net', type: 'numeric' })
  unitPriceNet: Amount;

  @Column({ name: 'unit_price_gross', type: 'numeric', nullable: true })
  unitPriceGross: Amount | null;

  @Column({ name: 'vat_rate', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericToNumber })
  vatRate: number | null;

  @Column({ type: 'numeric', nullable: true })
  discount: Amount | null;

  @Column({ name: 'line_net', type: 'numeric' })
  lineNet: Amount;

  @Column({ name: 'line_vat', type: 'numeric', nullable: true })
  lineVat: Amount | null;

  @Column({ name: 'line_gross', type: 'numeric' })
  lineGross: Amount;

  @Column({ type: 'int', default: 0 })
  position: number;
}
