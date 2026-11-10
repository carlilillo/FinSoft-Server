import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';

@Entity('vendors')
@Index(['userId', 'normalizedKey'], { unique: true })
export class VendorEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'normalized_key', type: 'varchar', length: 255 })
  normalizedKey: string;

  @Column({ name: 'tax_id', type: 'varchar', length: 64, nullable: true })
  taxId: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  country: string | null;
}
