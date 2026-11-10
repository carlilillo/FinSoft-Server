import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';

/** One Gmail account a user linked. A user may link several; each address appears once per user. */
@Entity('gmail_connections')
@Index(['userId', 'googleEmail'], { unique: true })
export class GmailConnectionEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ name: 'google_email', type: 'varchar', length: 320 })
  googleEmail: string;

  /** Null once the user disconnects the account: the row stays so past emails and invoices keep their origin. */
  @Column({ name: 'refresh_token_enc', type: 'text', nullable: true })
  refreshTokenEnc: string | null;

  @Column({ type: 'text' })
  scopes: string;

  @Column({ name: 'connected_at', type: 'timestamptz' })
  connectedAt: Date;
}
