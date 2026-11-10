import { Column, Entity, PrimaryColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';

@Entity('gmail_connections')
export class GmailConnectionEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id', unique: true })
  userId: string;

  @Column({ name: 'google_email', type: 'varchar', length: 320, nullable: true })
  googleEmail: string | null;

  @Column({ name: 'refresh_token_enc', type: 'text' })
  refreshTokenEnc: string;

  @Column({ type: 'text' })
  scopes: string;

  @Column({ name: 'connected_at', type: 'timestamptz' })
  connectedAt: Date;
}
