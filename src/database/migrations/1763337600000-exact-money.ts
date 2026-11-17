import type { MigrationInterface, QueryRunner } from 'typeorm';

/** [table, column without the `_cents` suffix, NOT NULL] */
const MONEY_COLUMNS: Array<[string, string, boolean]> = [
  ['invoices', 'subtotal', true],
  ['invoices', 'vat', true],
  ['invoices', 'withholding', false],
  ['invoices', 'total', true],
  ['invoice_lines', 'unit_price_net', true],
  ['invoice_lines', 'unit_price_gross', false],
  ['invoice_lines', 'discount', false],
  ['invoice_lines', 'line_net', true],
  ['invoice_lines', 'line_vat', false],
  ['invoice_lines', 'line_gross', true],
];

/**
 * Money moves from integer cents (bigint) to exact decimals (unconstrained numeric), so sub-cent unit prices
 * such as Railway's "0.00000023148148" per MB/min are stored as printed instead of being rounded to 0, and
 * currencies without two decimals (JPY, KWD) are represented correctly. Existing values are backfilled with
 * two decimals; unit prices that were already rounded to cents need their invoice extracted again.
 * Quantities are widened too, because metered usage (MB-minutes, tokens) easily exceeds 1e9.
 */
export class ExactMoney1763337600000 implements MigrationInterface {
  name = 'ExactMoney1763337600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column, notNull] of MONEY_COLUMNS) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${column} numeric`);
      await queryRunner.query(`UPDATE ${table} SET ${column} = round(${column}_cents / 100.0, 2)`);
      if (notNull) await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${column}_cents`);
    }
    await queryRunner.query(`ALTER TABLE invoice_lines ALTER COLUMN quantity TYPE numeric(20,6)`);
  }

  /** Lossy: amounts are rounded back to whole cents and quantities to 3 decimals. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoice_lines ALTER COLUMN quantity TYPE numeric(12,3)`);
    for (const [table, column, notNull] of MONEY_COLUMNS) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${column}_cents bigint`);
      await queryRunner.query(`UPDATE ${table} SET ${column}_cents = round(${column} * 100)::bigint`);
      if (notNull) await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN ${column}_cents SET NOT NULL`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
  }
}
