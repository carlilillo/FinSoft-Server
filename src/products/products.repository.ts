import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ProductSummaryRow {
  id: string;
  displayName: string;
  sku: string | null;
  unit: string | null;
  vendorId: string;
  vendorName: string;
  purchaseCount: number;
  lastUnitPriceNetCents: number | null;
  lastUnitPriceGrossCents: number | null;
  lastCurrency: string | null;
  lastPurchasedAt: string | null;
}

export interface PricePointRow {
  invoiceId: string;
  invoiceNumber: string | null;
  issueDate: string;
  currency: string;
  quantity: number;
  unitPriceNetCents: number;
  unitPriceGrossCents: number | null;
  vatRate: number | null;
}

const SUMMARY_SELECT = `
  SELECT p.id, p.display_name AS "displayName", p.sku, p.unit, p.vendor_id AS "vendorId", v.name AS "vendorName",
         COALESCE(stats.purchase_count, 0)::int AS "purchaseCount",
         last.unit_price_net_cents::bigint AS "lastUnitPriceNetCents",
         last.unit_price_gross_cents::bigint AS "lastUnitPriceGrossCents",
         last.currency AS "lastCurrency",
         to_char(last.issue_date, 'YYYY-MM-DD') AS "lastPurchasedAt"
  FROM products p
  JOIN vendors v ON v.id = p.vendor_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS purchase_count FROM invoice_lines l WHERE l.product_id = p.id
  ) stats ON true
  LEFT JOIN LATERAL (
    SELECT l.unit_price_net_cents, l.unit_price_gross_cents, i.currency, i.issue_date
    FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
    WHERE l.product_id = p.id
    ORDER BY i.issue_date DESC, i.id DESC
    LIMIT 1
  ) last ON true
`;

@Injectable()
export class ProductsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(userId: string, search: string | undefined, page: number, pageSize: number): Promise<[ProductSummaryRow[], number]> {
    const term = search ? `%${search.replace(/[%_]/g, '\\$&')}%` : null;
    const filter = `WHERE p.user_id = $1 AND ($2::text IS NULL OR p.display_name ILIKE $2 OR v.name ILIKE $2 OR p.sku ILIKE $2)`;
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `${SUMMARY_SELECT} ${filter} ORDER BY last.issue_date DESC NULLS LAST, p.display_name ASC LIMIT $3 OFFSET $4`,
      [userId, term, pageSize, (page - 1) * pageSize],
    );
    const [{ count }] = await this.dataSource.query<[{ count: string }]>(
      `SELECT count(*) FROM products p JOIN vendors v ON v.id = p.vendor_id ${filter}`,
      [userId, term],
    );
    return [rows.map(normalizeSummary), Number(count)];
  }

  async findSummary(userId: string, productId: string): Promise<ProductSummaryRow | null> {
    const rows = await this.dataSource.query<ProductSummaryRow[]>(`${SUMMARY_SELECT} WHERE p.user_id = $1 AND p.id = $2`, [
      userId,
      productId,
    ]);
    return rows[0] ? normalizeSummary(rows[0]) : null;
  }

  async findForInvoiceIds(userId: string, invoiceIds: string[]): Promise<ProductSummaryRow[]> {
    if (invoiceIds.length === 0) return [];
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `${SUMMARY_SELECT} WHERE p.user_id = $1 AND p.id IN (
         SELECT DISTINCT product_id FROM invoice_lines WHERE invoice_id = ANY($2::char(26)[])
       ) ORDER BY p.display_name`,
      [userId, invoiceIds],
    );
    return rows.map(normalizeSummary);
  }

  async priceHistory(userId: string, productId: string): Promise<PricePointRow[]> {
    const rows = await this.dataSource.query<PricePointRow[]>(
      `SELECT i.id AS "invoiceId", i.invoice_number AS "invoiceNumber", to_char(i.issue_date, 'YYYY-MM-DD') AS "issueDate",
              i.currency, l.quantity, l.unit_price_net_cents AS "unitPriceNetCents",
              l.unit_price_gross_cents AS "unitPriceGrossCents", l.vat_rate AS "vatRate"
       FROM invoice_lines l
       JOIN invoices i ON i.id = l.invoice_id
       JOIN products p ON p.id = l.product_id
       WHERE p.user_id = $1 AND p.id = $2
       ORDER BY i.issue_date ASC, i.id ASC`,
      [userId, productId],
    );
    return rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      unitPriceNetCents: Number(row.unitPriceNetCents),
      unitPriceGrossCents: row.unitPriceGrossCents === null ? null : Number(row.unitPriceGrossCents),
      vatRate: row.vatRate === null ? null : Number(row.vatRate),
    }));
  }
}

function normalizeSummary(row: ProductSummaryRow): ProductSummaryRow {
  return {
    ...row,
    lastUnitPriceNetCents: row.lastUnitPriceNetCents === null ? null : Number(row.lastUnitPriceNetCents),
    lastUnitPriceGrossCents: row.lastUnitPriceGrossCents === null ? null : Number(row.lastUnitPriceGrossCents),
  };
}
