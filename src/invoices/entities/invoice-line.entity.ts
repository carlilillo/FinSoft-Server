import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { bigintToNumber, numericToNumber, ULID_COLUMN } from '../../database/column-types.js';
import { ProductEntity } from '../../products/entities/product.entity.js';
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

  @Column({ type: 'numeric', precision: 12, scale: 3, transformer: numericToNumber })
  quantity: number;

  @Column({ name: 'unit_price_net_cents', type: 'bigint', transformer: bigintToNumber })
  unitPriceNetCents: number;

  @Column({ name: 'unit_price_gross_cents', type: 'bigint', nullable: true, transformer: bigintToNumber })
  unitPriceGrossCents: number | null;

  @Column({ name: 'vat_rate', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericToNumber })
  vatRate: number | null;

  @Column({ name: 'discount_cents', type: 'bigint', nullable: true, transformer: bigintToNumber })
  discountCents: number | null;

  @Column({ name: 'line_net_cents', type: 'bigint', transformer: bigintToNumber })
  lineNetCents: number;

  @Column({ name: 'line_vat_cents', type: 'bigint', nullable: true, transformer: bigintToNumber })
  lineVatCents: number | null;

  @Column({ name: 'line_gross_cents', type: 'bigint', transformer: bigintToNumber })
  lineGrossCents: number;

  @Column({ type: 'int', default: 0 })
  position: number;
}
