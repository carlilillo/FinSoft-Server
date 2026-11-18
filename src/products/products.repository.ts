import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { InvoiceDirection } from '../invoices/domain/invoice-direction.js';
import type { Amount } from '../invoices/domain/money.js';

export interface ProductSummaryRow {
  id: string;
  /** `received`: bought from the vendor (a provider); `issued`: sold to the vendor (a customer). */
  direction: InvoiceDirection;
  displayName: string;
  sku: string | null;
  unit: string | null;
  vendorId: string;
  vendorName: string;
  purchaseCount: number;
  lastUnitPriceNet: Amount | null;
  lastUnitPriceGross: Amount | null;
  lastCurrency: string | null;
  lastPurchasedAt: string | null;
}

export interface PricePointRow {
  invoiceId: string;
  invoiceNumber: string | null;
  issueDate: string;
  currency: string;
  quantity: number;
  unitPriceNet: Amount;
  unitPriceGross: Amount | null;
  vatRate: number | null;
}

export interface ProductListFilters {
  search?: string;
  direction?: InvoiceDirection;
}

const SUMMARY_SELECT = `
  SELECT p.id, p.direction, p.display_name AS "displayName", p.sku, p.unit, p.vendor_id AS "vendorId", v.name AS "vendorName",
         COALESCE(stats.purchase_count, 0)::int AS "purchaseCount",
         last.unit_price_net::text AS "lastUnitPriceNet",
         last.unit_price_gross::text AS "lastUnitPriceGross",
         last.currency AS "lastCurrency",
         to_char(last.issue_date, 'YYYY-MM-DD') AS "lastPurchasedAt"
  FROM products p
  JOIN vendors v ON v.id = p.vendor_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS purchase_count FROM invoice_lines l WHERE l.product_id = p.id
  ) stats ON true
  LEFT JOIN LATERAL (
    SELECT l.unit_price_net, l.unit_price_gross, i.currency, i.issue_date
    FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
    WHERE l.product_id = p.id
    ORDER BY i.issue_date DESC, i.id DESC
    LIMIT 1
  ) last ON true
`;

@Injectable()
export class ProductsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    userId: string,
    filters: ProductListFilters,
    page: number,
    pageSize: number,
  ): Promise<[ProductSummaryRow[], number]> {
    const term = filters.search ? `%${filters.search.replace(/[%_]/g, '\\$&')}%` : null;
    const filter = `WHERE p.user_id = $1
      AND ($2::text IS NULL OR p.display_name ILIKE $2 OR v.name ILIKE $2 OR p.sku ILIKE $2)
      AND ($3::text IS NULL OR p.direction = $3)`;
    const params = [userId, term, filters.direction ?? null];
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `${SUMMARY_SELECT} ${filter} ORDER BY last.issue_date DESC NULLS LAST, p.display_name ASC LIMIT $4 OFFSET $5`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const [{ count }] = await this.dataSource.query<[{ count: string }]>(
      `SELECT count(*) FROM products p JOIN vendors v ON v.id = p.vendor_id ${filter}`,
      params,
    );
    return [rows, Number(count)];
  }

  async findSummary(userId: string, productId: string): Promise<ProductSummaryRow | null> {
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `${SUMMARY_SELECT} WHERE p.user_id = $1 AND p.id = $2`,
      [userId, productId],
    );
    return rows[0] ?? null;
  }

  async findForInvoiceIds(userId: string, invoiceIds: string[]): Promise<ProductSummaryRow[]> {
    if (invoiceIds.length === 0) return [];
    const rows = await this.dataSource.query<ProductSummaryRow[]>(
      `${SUMMARY_SELECT} WHERE p.user_id = $1 AND p.id IN (
         SELECT DISTINCT product_id FROM invoice_lines WHERE invoice_id = ANY($2::char(26)[])
       ) ORDER BY p.display_name`,
      [userId, invoiceIds],
    );
    return rows;
  }

  async priceHistory(userId: string, productId: string): Promise<PricePointRow[]> {
    const rows = await this.dataSource.query<PricePointRow[]>(
      `SELECT i.id AS "invoiceId", i.invoice_number AS "invoiceNumber", to_char(i.issue_date, 'YYYY-MM-DD') AS "issueDate",
              i.currency, l.quantity, l.unit_price_net::text AS "unitPriceNet",
              l.unit_price_gross::text AS "unitPriceGross", l.vat_rate AS "vatRate"
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
      vatRate: row.vatRate === null ? null : Number(row.vatRate),
    }));
  }
}
