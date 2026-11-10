import { z } from 'zod';

const decimal = z
  .string()
  .describe('Decimal amount with "." as decimal separator and no thousands separator, e.g. "1234.56"');
const nullableText = (description: string) => z.string().nullable().describe(description);
const ulid = z.string().length(26);

export const recordTriageSchema = z.object({
  emailId: ulid.describe('The email id (folder name under /inbox/)'),
  verdict: z.enum(['likely_invoice', 'not_invoice', 'failed']),
  reason: z.string().min(1).max(500).describe('One sentence, in English'),
  language: z.enum(['en', 'es', 'other']).describe('Language of the email'),
});

export const saveInvoiceSchema = z.object({
  emailId: ulid.describe('The email the invoice came from'),
  vendor: z.object({
    name: z.string().min(1).describe('Legal or trading name of the issuer'),
    taxId: nullableText('VAT number / NIF / CIF exactly as printed, or null'),
    address: nullableText('Postal address on one line, or null'),
    email: nullableText('Vendor contact email, or null'),
    phone: nullableText('Vendor phone, or null'),
    website: nullableText('Vendor website, or null'),
    country: nullableText('ISO 3166-1 alpha-2 country code (ES, GB, US…), or null'),
  }),
  invoiceNumber: nullableText('Invoice number including series, or null if the document has none'),
  issueDate: z.string().describe('ISO date YYYY-MM-DD'),
  dueDate: nullableText('ISO date YYYY-MM-DD, or null'),
  currency: z.string().length(3).describe('ISO 4217 code, e.g. EUR'),
  subtotal: decimal.describe('Net amount before VAT (base imponible)'),
  vat: decimal.describe('Total VAT, including recargo de equivalencia'),
  withholding: decimal.nullable().describe('IRPF / withholding amount as a positive number, or null'),
  total: decimal.describe('Total payable'),
  paymentMethod: nullableText('e.g. card, bank transfer, direct debit, cash; or null'),
  language: z.enum(['en', 'es', 'other']).describe('Language of the invoice document'),
  notes: nullableText('Short relevant notes (period billed, contract), or null'),
});

export const saveInvoiceProductsSchema = z.object({
  invoiceId: ulid.describe('Returned by save_invoice'),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).describe('Product or service as written on the invoice'),
        sku: nullableText('SKU / reference / código, or null'),
        unit: nullableText('Unit of measure (kg, h, ud, month…), or null'),
        quantity: z.number().positive(),
        unitPriceNet: decimal.describe('Unit price without VAT'),
        unitPriceGross: decimal.nullable().describe('Unit price with VAT, or null if not printed'),
        vatRate: z.number().min(0).max(100).nullable().describe('VAT percentage, e.g. 21, or null'),
        discount: decimal.nullable().describe('Discount amount on this line, or null'),
        lineNet: decimal.describe('Line amount without VAT'),
        lineVat: decimal.nullable().describe('VAT amount of the line, or null'),
        lineGross: decimal.describe('Line amount with VAT (equal to lineNet when VAT is unknown or 0)'),
      }),
    )
    .min(1),
});

export const storeInvoiceDocumentSchema = z.object({
  invoiceId: ulid.describe('Returned by save_invoice'),
  path: z.string().describe('Attachment path, e.g. /inbox/{emailId}/attachments/factura.pdf'),
});
