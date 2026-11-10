import type { InvoiceDocumentEntity } from '../../documents/entities/invoice-document.entity.js';
import type { InvoiceLineEntity } from '../entities/invoice-line.entity.js';
import type { InvoiceEntity } from '../entities/invoice.entity.js';
import type { VendorEntity } from '../entities/vendor.entity.js';

export function toVendorView(vendor: VendorEntity) {
  return {
    id: vendor.id,
    name: vendor.name,
    taxId: vendor.taxId,
    address: vendor.address,
    email: vendor.email,
    phone: vendor.phone,
    website: vendor.website,
    country: vendor.country,
  };
}

export function toInvoiceSummaryView(invoice: InvoiceEntity & { lineCount?: number }) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    vatCents: invoice.vatCents,
    withholdingCents: invoice.withholdingCents,
    totalCents: invoice.totalCents,
    language: invoice.language,
    runId: invoice.runId,
    vendor: invoice.vendor ? { id: invoice.vendor.id, name: invoice.vendor.name } : null,
    lineCount: invoice.lineCount ?? invoice.lines?.length ?? 0,
  };
}

export function toInvoiceLineView(line: InvoiceLineEntity) {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.product?.displayName ?? line.description,
    sku: line.product?.sku ?? null,
    unit: line.product?.unit ?? null,
    description: line.description,
    quantity: line.quantity,
    unitPriceNetCents: line.unitPriceNetCents,
    unitPriceGrossCents: line.unitPriceGrossCents,
    vatRate: line.vatRate,
    discountCents: line.discountCents,
    lineNetCents: line.lineNetCents,
    lineVatCents: line.lineVatCents,
    lineGrossCents: line.lineGrossCents,
  };
}

export function toDocumentView(document: InvoiceDocumentEntity) {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    source: document.source,
    createdAt: document.createdAt,
  };
}
