import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Page } from '../common/dto/pagination.dto.js';
import { InvoiceDocumentEntity } from '../documents/entities/invoice-document.entity.js';
import {
  toDocumentView,
  toInvoiceLineView,
  toInvoiceSummaryView,
  toVendorView,
} from './dto/invoice.views.js';
import type { ListInvoicesQueryDto } from './dto/list-invoices.query.js';
import { InvoicesRepository } from './invoices.repository.js';

export type InvoiceSummaryView = ReturnType<typeof toInvoiceSummaryView>;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoices: InvoicesRepository,
    @InjectRepository(InvoiceDocumentEntity) private readonly documents: Repository<InvoiceDocumentEntity>,
  ) {}

  async list(userId: string, query: ListInvoicesQueryDto): Promise<Page<InvoiceSummaryView>> {
    const [items, total] = await this.invoices.list(userId, query);
    return { items: items.map(toInvoiceSummaryView), page: query.page, pageSize: query.pageSize, total };
  }

  async detail(userId: string, id: string) {
    const invoice = await this.invoices.findDetail(userId, id);
    if (!invoice?.vendor) throw new NotFoundException(`Invoice ${id} not found`);
    const documents = await this.documents.find({
      where: { invoiceId: id, userId, status: 'available' },
      order: { createdAt: 'ASC' },
    });
    return {
      ...toInvoiceSummaryView(invoice),
      paymentMethod: invoice.paymentMethod,
      notes: invoice.notes,
      emailId: invoice.emailId,
      createdAt: invoice.createdAt,
      vendor: toVendorView(invoice.vendor),
      lines: (invoice.lines ?? []).map(toInvoiceLineView),
      documents: documents.map(toDocumentView),
    };
  }
}
