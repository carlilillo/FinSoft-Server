import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Invoices can be imported as images (photos, scans, screenshots) as well as PDFs, so an imported
 * file now records its real format. Every file imported until now was a PDF.
 */
export class ImageImports1763078400000 implements MigrationInterface {
  name = 'ImageImports1763078400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE import_files ADD COLUMN mime_type varchar(127) NOT NULL DEFAULT 'application/pdf';
      ALTER TABLE import_files ALTER COLUMN mime_type DROP DEFAULT;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE import_files DROP COLUMN mime_type;`);
  }
}
