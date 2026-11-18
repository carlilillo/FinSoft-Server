/**
 * Which side of an invoice the user is on: `issued` invoices are the ones the user sends to their customers (income),
 * `received` invoices are the ones providers send the user (spend). Products follow the direction of the invoices
 * their lines come from, so what the user sells is never mixed with what the user buys.
 */
export type InvoiceDirection = 'issued' | 'received';

export const INVOICE_DIRECTIONS: readonly InvoiceDirection[] = ['issued', 'received'];

export function isInvoiceDirection(value: unknown): value is InvoiceDirection {
  return typeof value === 'string' && (INVOICE_DIRECTIONS as readonly string[]).includes(value);
}
