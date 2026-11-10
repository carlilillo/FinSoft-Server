import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Manual invoice imports: an analysis run can now be fed by PDFs the user uploads instead of their
 * inbox. Also retires the presigned "upload a document" flow (documents are only ever stored by the
 * server now, so they are always available and always hashed).
 */
export class InvoiceImports1762819200000 implements MigrationInterface {
  name = 'InvoiceImports1762819200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE analysis_runs
        ADD COLUMN source varchar(16) NOT NULL DEFAULT 'gmail',
        ADD COLUMN documents_total int NOT NULL DEFAULT 0;

      CREATE TABLE import_files (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        run_id char(26) NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
        file_name varchar(255) NOT NULL,
        workspace_path varchar(255) NOT NULL,
        size_bytes bigint NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_import_files_run ON import_files (run_id);

      ALTER TABLE invoices
        ADD COLUMN import_file_id char(26) REFERENCES import_files(id) ON DELETE SET NULL;

      DELETE FROM invoice_documents WHERE status = 'pending_upload';
      UPDATE invoice_documents SET source = 'import' WHERE source = 'upload';
      ALTER TABLE invoice_documents DROP COLUMN status;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_documents ADD COLUMN status varchar(16) NOT NULL DEFAULT 'available';
      UPDATE invoice_documents SET source = 'upload' WHERE source = 'import';
      ALTER TABLE invoices DROP COLUMN import_file_id;
      DROP TABLE import_files;
      ALTER TABLE analysis_runs DROP COLUMN documents_total, DROP COLUMN source;
    `);
  }
}
