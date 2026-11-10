import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Several Gmail accounts per user. A connection is now identified by (user, Google address); the
 * emails and invoices read from an inbox point at it so their origin can be shown. Disconnecting an
 * account wipes its token but keeps the row, so that trace survives (and reconnecting restores it).
 * Existing rows are linked to the single account each user had until now.
 */
export class GmailAccounts1762992000000 implements MigrationInterface {
  name = 'GmailAccounts1762992000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM gmail_connections WHERE google_email IS NULL;
      UPDATE gmail_connections SET google_email = lower(google_email);

      ALTER TABLE gmail_connections
        DROP CONSTRAINT gmail_connections_user_id_key,
        ALTER COLUMN google_email SET NOT NULL,
        ALTER COLUMN refresh_token_enc DROP NOT NULL,
        ADD CONSTRAINT uq_gmail_connections_user_email UNIQUE (user_id, google_email);

      ALTER TABLE emails
        ADD COLUMN gmail_connection_id char(26) REFERENCES gmail_connections(id) ON DELETE SET NULL;
      UPDATE emails SET gmail_connection_id = connection.id
        FROM gmail_connections connection WHERE connection.user_id = emails.user_id;

      ALTER TABLE invoices
        ADD COLUMN gmail_connection_id char(26) REFERENCES gmail_connections(id) ON DELETE SET NULL;
      UPDATE invoices SET gmail_connection_id = email.gmail_connection_id
        FROM emails email WHERE email.id = invoices.email_id;
    `);
  }

  /** Back to one account per user: the earliest connected one is kept. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices DROP COLUMN gmail_connection_id;
      ALTER TABLE emails DROP COLUMN gmail_connection_id;

      DELETE FROM gmail_connections WHERE refresh_token_enc IS NULL;
      DELETE FROM gmail_connections older USING gmail_connections kept
        WHERE older.user_id = kept.user_id
          AND (kept.connected_at, kept.id) < (older.connected_at, older.id);

      ALTER TABLE gmail_connections
        DROP CONSTRAINT uq_gmail_connections_user_email,
        ALTER COLUMN refresh_token_enc SET NOT NULL,
        ALTER COLUMN google_email DROP NOT NULL,
        ADD CONSTRAINT gmail_connections_user_id_key UNIQUE (user_id);
    `);
  }
}
