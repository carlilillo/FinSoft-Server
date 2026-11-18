import type { MigrationInterface, QueryRunner } from 'typeorm';

const DIRECTION_COLUMN = `varchar(8) NOT NULL DEFAULT 'received'`;
const DIRECTION_CHECK = `CHECK (direction IN ('issued', 'received'))`;

/**
 * Invoices now have a direction: `issued` (the user billed a customer) or `received` (a provider billed the user).
 * Everything stored so far came from providers, so it is backfilled as `received`. On an issued invoice the vendor is
 * the customer billed. Products take the direction of their invoices, so a company that is both a customer and a
 * provider keeps what it sells the user apart from what the user sells it. Import sessions and phone upload links
 * remember which kind of invoices the user chose to import.
 */
export class InvoiceDirection1763424000000 implements MigrationInterface {
  name = 'InvoiceDirection1763424000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
        ADD COLUMN direction ${DIRECTION_COLUMN},
        ADD CONSTRAINT chk_invoices_direction ${DIRECTION_CHECK};
      DROP INDEX uq_invoices_user_vendor_number;
      CREATE UNIQUE INDEX uq_invoices_user_direction_vendor_number
        ON invoices (user_id, direction, vendor_id, invoice_number) WHERE invoice_number IS NOT NULL;
      CREATE INDEX idx_invoices_user_direction_issue_date ON invoices (user_id, direction, issue_date DESC);

      ALTER TABLE products
        ADD COLUMN direction ${DIRECTION_COLUMN},
        ADD CONSTRAINT chk_products_direction ${DIRECTION_CHECK},
        DROP CONSTRAINT uq_products_user_vendor_key,
        ADD CONSTRAINT uq_products_user_direction_vendor_key UNIQUE (user_id, direction, vendor_id, normalized_key);

      ALTER TABLE analysis_runs
        ADD COLUMN invoice_direction ${DIRECTION_COLUMN},
        ADD CONSTRAINT chk_analysis_runs_invoice_direction CHECK (invoice_direction IN ('issued', 'received'));

      ALTER TABLE phone_upload_links
        ADD COLUMN invoice_direction ${DIRECTION_COLUMN},
        ADD CONSTRAINT chk_phone_upload_links_invoice_direction CHECK (invoice_direction IN ('issued', 'received'));
    `);
  }

  /** Lossy: issued invoices (with their lines and documents) and the products they created are deleted. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM invoices WHERE direction = 'issued';
      DELETE FROM products WHERE direction = 'issued';

      ALTER TABLE phone_upload_links
        DROP CONSTRAINT chk_phone_upload_links_invoice_direction,
        DROP COLUMN invoice_direction;

      ALTER TABLE analysis_runs
        DROP CONSTRAINT chk_analysis_runs_invoice_direction,
        DROP COLUMN invoice_direction;

      ALTER TABLE products
        DROP CONSTRAINT uq_products_user_direction_vendor_key,
        ADD CONSTRAINT uq_products_user_vendor_key UNIQUE (user_id, vendor_id, normalized_key),
        DROP CONSTRAINT chk_products_direction,
        DROP COLUMN direction;

      DROP INDEX idx_invoices_user_direction_issue_date;
      DROP INDEX uq_invoices_user_direction_vendor_number;
      CREATE UNIQUE INDEX uq_invoices_user_vendor_number
        ON invoices (user_id, vendor_id, invoice_number) WHERE invoice_number IS NOT NULL;
      ALTER TABLE invoices
        DROP CONSTRAINT chk_invoices_direction,
        DROP COLUMN direction;
    `);
  }
}
