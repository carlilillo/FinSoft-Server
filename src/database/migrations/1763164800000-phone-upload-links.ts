import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Invoices can be imported from a phone: the computer shows a QR code with a single-use link that
 * expires after 30 minutes. Only a hash of the link's token is stored.
 */
export class PhoneUploadLinks1763164800000 implements MigrationInterface {
  name = 'PhoneUploadLinks1763164800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE phone_upload_links (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE,
        status varchar(16) NOT NULL DEFAULT 'open',
        run_id char(26) REFERENCES analysis_runs(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_phone_upload_links_user ON phone_upload_links (user_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE phone_upload_links;`);
  }
}
