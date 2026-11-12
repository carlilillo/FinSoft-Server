import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { newId } from '../database/ids.js';
import { ProductEntity } from '../products/entities/product.entity.js';
import { createInvoice, type InvoiceLineDraft, validateInvoiceLines } from './domain/invoice.js';
import { toCents, toCentsOrNull } from './domain/money.js';
import { normalizeProductKey, normalizeVendorKey } from './domain/normalize.js';
import { InvoiceLineEntity } from './entities/invoice-line.entity.js';
import { InvoiceEntity } from './entities/invoice.entity.js';
import { VendorEntity } from './entities/vendor.entity.js';
import type { ExtractedInvoice, ExtractedLine, ExtractedVendor, SavedInvoice } from './invoice-writer.types.js';

export interface InvoiceProvenance {
  userId: string;
  runId: string | null;
  emailId: string | null;
  /** The Gmail account that email arrived in; null when the invoice did not come from an inbox. */
  gmailConnectionId: string | null;
  /** The imported document (PDF or image) the invoice was read from, when it did not come from an email. */
  importFileId: string | null;
}

/** Write side used by the extraction agents. Idempotent so re-running a thread never duplicates data. */
@Injectable()
export class InvoiceWriterService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async saveInvoice(provenance: InvoiceProvenance, extracted: ExtractedInvoice): Promise<SavedInvoice> {
    const draft = createInvoice({
      invoiceNumber: extracted.invoiceNumber,
      issueDate: extracted.issueDate,
      dueDate: extracted.dueDate,
      currency: extracted.currency,
      subtotalCents: toCents(extracted.subtotal, 'subtotal'),
      vatCents: toCents(extracted.vat, 'vat'),
      withholdingCents: toCentsOrNull(extracted.withholding, 'withholding'),
      totalCents: toCents(extracted.total, 'total'),
      paymentMethod: extracted.paymentMethod,
      language: extracted.language,
      notes: extracted.notes,
    });

    return this.dataSource.transaction(async (manager) => {
      const vendor = await this.upsertVendor(manager, provenance.userId, extracted.vendor);
      const existing = draft.invoiceNumber
        ? await manager.findOne(InvoiceEntity, {
            where: {
              userId: provenance.userId,
              vendorId: vendor.id,
              invoiceNumber: draft.invoiceNumber,
            },
          })
        : null;

      const invoice = manager.create(InvoiceEntity, {
        ...draft,
        id: existing?.id ?? newId(),
        userId: provenance.userId,
        vendorId: vendor.id,
        runId: provenance.runId ?? existing?.runId ?? null,
        emailId: provenance.emailId ?? existing?.emailId ?? null,
        gmailConnectionId: provenance.gmailConnectionId ?? existing?.gmailConnectionId ?? null,
        importFileId: provenance.importFileId ?? existing?.importFileId ?? null,
      });
      await manager.save(InvoiceEntity, invoice);
      return { invoiceId: invoice.id, vendorId: vendor.id, created: !existing };
    });
  }

  /** Replaces the invoice's lines; products are upserted per vendor so price history accumulates. */
  async saveLines(
    userId: string,
    invoiceId: string,
    extractedLines: ExtractedLine[],
  ): Promise<{
    lineCount: number;
    productIds: string[];
    emailId: string | null;
  }> {
    const invoice = await this.dataSource.manager.findOne(InvoiceEntity, {
      where: { id: invoiceId, userId },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found; call save_invoice first`);

    const lines = validateInvoiceLines(invoice, extractedLines.map(toLineDraft));

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(InvoiceLineEntity, { invoiceId });
      const productIds: string[] = [];
      for (const [position, line] of lines.entries()) {
        const product = await this.upsertProduct(manager, userId, invoice.vendorId, line);
        productIds.push(product.id);
        await manager.insert(InvoiceLineEntity, {
          id: newId(),
          invoiceId,
          productId: product.id,
          description: line.description,
          quantity: line.quantity,
          unitPriceNetCents: line.unitPriceNetCents,
          unitPriceGrossCents: line.unitPriceGrossCents,
          vatRate: line.vatRate,
          discountCents: line.discountCents,
          lineNetCents: line.lineNetCents,
          lineVatCents: line.lineVatCents,
          lineGrossCents: line.lineGrossCents,
          position,
        });
      }
      return {
        lineCount: lines.length,
        productIds: [...new Set(productIds)],
        emailId: invoice.emailId,
      };
    });
  }

  private async upsertVendor(manager: EntityManager, userId: string, vendor: ExtractedVendor): Promise<VendorEntity> {
    const normalizedKey = normalizeVendorKey(vendor.name, vendor.taxId);
    const existing = await manager.findOne(VendorEntity, {
      where: { userId, normalizedKey },
    });
    const merged = manager.create(VendorEntity, {
      id: existing?.id ?? newId(),
      userId,
      normalizedKey,
      name: existing?.name ?? vendor.name.trim(),
      // Keep known contact details when a later invoice omits them.
      taxId: vendor.taxId ?? existing?.taxId ?? null,
      address: vendor.address ?? existing?.address ?? null,
      email: vendor.email ?? existing?.email ?? null,
      phone: vendor.phone ?? existing?.phone ?? null,
      website: vendor.website ?? existing?.website ?? null,
      country: vendor.country?.toUpperCase().slice(0, 2) ?? existing?.country ?? null,
    });
    return manager.save(VendorEntity, merged);
  }

  private async upsertProduct(
    manager: EntityManager,
    userId: string,
    vendorId: string,
    line: InvoiceLineDraft,
  ): Promise<ProductEntity> {
    const normalizedKey = normalizeProductKey(line.description, line.sku);
    const existing = await manager.findOne(ProductEntity, {
      where: { userId, vendorId, normalizedKey },
    });
    if (existing) {
      if ((!existing.sku && line.sku) || (!existing.unit && line.unit)) {
        await manager.update(
          ProductEntity,
          { id: existing.id },
          { sku: existing.sku ?? line.sku, unit: existing.unit ?? line.unit },
        );
      }
      return existing;
    }
    const product = manager.create(ProductEntity, {
      id: newId(),
      userId,
      vendorId,
      normalizedKey,
      displayName: line.description,
      sku: line.sku,
      unit: line.unit,
    });
    return manager.save(ProductEntity, product);
  }
}

function toLineDraft(line: ExtractedLine, index: number): InvoiceLineDraft {
  const field = (name: string) => `lines[${index}].${name}`;
  return {
    description: line.description,
    sku: line.sku?.trim() || null,
    unit: line.unit?.trim() || null,
    quantity: line.quantity,
    unitPriceNetCents: toCents(line.unitPriceNet, field('unitPriceNet')),
    unitPriceGrossCents: toCentsOrNull(line.unitPriceGross, field('unitPriceGross')),
    vatRate: line.vatRate,
    discountCents: toCentsOrNull(line.discount, field('discount')),
    lineNetCents: toCents(line.lineNet, field('lineNet')),
    lineVatCents: toCentsOrNull(line.lineVat, field('lineVat')),
    lineGrossCents: toCents(line.lineGross, field('lineGross')),
  };
}
