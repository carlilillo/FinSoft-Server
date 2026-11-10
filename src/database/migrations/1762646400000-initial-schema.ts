import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial FinSift schema. Every `user_id` is the Clerk user id and cascades on account deletion.
 * Vendor/product references use NO ACTION (checked at statement end) so a user cascade can remove
 * invoices, lines, products and vendors in one statement.
 */
export class InitialSchema1762646400000 implements MigrationInterface {
  name = 'InitialSchema1762646400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id char(26) PRIMARY KEY,
        clerk_user_id varchar(32) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE gmail_connections (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL UNIQUE REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        google_email varchar(320),
        refresh_token_enc text NOT NULL,
        scopes text NOT NULL,
        connected_at timestamptz NOT NULL
      );

      CREATE TABLE analysis_runs (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        status varchar(24) NOT NULL,
        stage_detail varchar(255),
        emails_total int NOT NULL DEFAULT 0,
        error text,
        invocation_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      );
      CREATE INDEX idx_analysis_runs_user_created ON analysis_runs (user_id, created_at DESC);

      CREATE TABLE emails (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        run_id char(26) NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
        gmail_message_id varchar(64) NOT NULL,
        subject varchar(998),
        sender_name varchar(320),
        sender_email varchar(320) NOT NULL,
        received_at timestamptz NOT NULL,
        attachment_count int NOT NULL DEFAULT 0,
        language varchar(8),
        triage varchar(24) NOT NULL DEFAULT 'pending',
        triage_reason text,
        CONSTRAINT uq_emails_run_message UNIQUE (run_id, gmail_message_id)
      );

      CREATE TABLE vendors (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        normalized_key varchar(255) NOT NULL,
        tax_id varchar(64),
        address text,
        email varchar(320),
        phone varchar(64),
        website varchar(255),
        country char(2),
        CONSTRAINT uq_vendors_user_key UNIQUE (user_id, normalized_key)
      );

      CREATE TABLE invoices (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        run_id char(26) REFERENCES analysis_runs(id) ON DELETE SET NULL,
        email_id char(26) REFERENCES emails(id) ON DELETE SET NULL,
        vendor_id char(26) NOT NULL REFERENCES vendors(id) ON DELETE NO ACTION,
        invoice_number varchar(128),
        issue_date date NOT NULL,
        due_date date,
        currency char(3) NOT NULL,
        subtotal_cents bigint NOT NULL,
        vat_cents bigint NOT NULL,
        withholding_cents bigint,
        total_cents bigint NOT NULL,
        payment_method varchar(64),
        language varchar(8) NOT NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_invoices_user_issue_date ON invoices (user_id, issue_date DESC);
      CREATE INDEX idx_invoices_run ON invoices (run_id);
      CREATE UNIQUE INDEX uq_invoices_user_vendor_number ON invoices (user_id, vendor_id, invoice_number)
        WHERE invoice_number IS NOT NULL;

      CREATE TABLE products (
        id char(26) PRIMARY KEY,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        vendor_id char(26) NOT NULL REFERENCES vendors(id) ON DELETE NO ACTION,
        display_name varchar(512) NOT NULL,
        normalized_key varchar(512) NOT NULL,
        sku varchar(128),
        unit varchar(32),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_products_user_vendor_key UNIQUE (user_id, vendor_id, normalized_key)
      );

      CREATE TABLE invoice_lines (
        id char(26) PRIMARY KEY,
        invoice_id char(26) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id char(26) NOT NULL REFERENCES products(id) ON DELETE NO ACTION,
        description text NOT NULL,
        quantity numeric(12,3) NOT NULL,
        unit_price_net_cents bigint NOT NULL,
        unit_price_gross_cents bigint,
        vat_rate numeric(5,2),
        discount_cents bigint,
        line_net_cents bigint NOT NULL,
        line_vat_cents bigint,
        line_gross_cents bigint NOT NULL,
        position int NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id);
      CREATE INDEX idx_invoice_lines_product ON invoice_lines (product_id);

      CREATE TABLE invoice_documents (
        id char(26) PRIMARY KEY,
        invoice_id char(26) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        user_id varchar(32) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        s3_key varchar(1024) NOT NULL,
        file_name varchar(255) NOT NULL,
        mime_type varchar(127) NOT NULL,
        size_bytes bigint NOT NULL,
        sha256 char(64),
        source varchar(16) NOT NULL,
        status varchar(16) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX uq_invoice_documents_hash ON invoice_documents (invoice_id, sha256) WHERE sha256 IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS invoice_documents, invoice_lines, products, invoices, vendors, emails,
        analysis_runs, gmail_connections, users CASCADE;
    `);
  }
}
