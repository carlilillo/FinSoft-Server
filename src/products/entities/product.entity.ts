import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import { VendorEntity } from '../../invoices/entities/vendor.entity.js';

@Entity('products')
@Index(['userId', 'vendorId', 'normalizedKey'], { unique: true })
export class ProductEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ ...ULID_COLUMN, name: 'vendor_id' })
  vendorId: string;

  @ManyToOne(() => VendorEntity, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: Relation<VendorEntity>;

  @Column({ name: 'display_name', type: 'varchar', length: 512 })
  displayName: string;

  @Column({ name: 'normalized_key', type: 'varchar', length: 512 })
  normalizedKey: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
