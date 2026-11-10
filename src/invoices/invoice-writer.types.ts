import type { InvoiceLanguage } from './domain/invoice.js';

/** Amounts arrive as decimal strings ("1234.56") exactly as extracted; the writer converts them to cents. */
export interface ExtractedVendor {
  name: string;
  taxId: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
}

export interface ExtractedInvoice {
  vendor: ExtractedVendor;
  invoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  subtotal: string;
  vat: string;
  withholding: string | null;
  total: string;
  paymentMethod: string | null;
  language: InvoiceLanguage;
  notes: string | null;
}

export interface ExtractedLine {
  description: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  unitPriceNet: string;
  unitPriceGross: string | null;
  vatRate: number | null;
  discount: string | null;
  lineNet: string;
  lineVat: string | null;
  lineGross: string;
}

export interface SavedInvoice {
  invoiceId: string;
  vendorId: string;
  created: boolean;
}
