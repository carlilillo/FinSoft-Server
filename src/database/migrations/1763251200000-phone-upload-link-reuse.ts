import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An open phone upload link is shown again instead of creating a new one each time, so its token is
 * now kept encrypted (AES-256-GCM, like Gmail refresh tokens). Existing links have none and are never
 * reused; they still work until they expire.
 */
export class PhoneUploadLinkReuse1763251200000 implements MigrationInterface {
  name = 'PhoneUploadLinkReuse1763251200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE phone_upload_links ADD COLUMN token_enc text;
      CREATE INDEX idx_phone_upload_links_user_open ON phone_upload_links (user_id, expires_at) WHERE status = 'open';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_phone_upload_links_user_open;
      ALTER TABLE phone_upload_links DROP COLUMN token_enc;
    `);
  }
}
