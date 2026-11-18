import { Injectable } from '@nestjs/common';
import type { InvoiceDirection } from '../invoices/domain/invoice-direction.js';
import { toInvoiceSummaryView } from '../invoices/dto/invoice.views.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';
import { cashFlowWindow, computeCashFlow, type CashFlowRange } from './domain/cash-flow.js';

const RECENT_INVOICES = 5;

@Injectable()
export class InsightsService {
  constructor(private readonly invoices: InvoicesRepository) {}

  async cashFlow(userId: string, range: CashFlowRange, today = todayIso()) {
    const window = cashFlowWindow(range, today);
    const invoices = await this.invoices.findForCashFlow(userId, window.previousFrom, window.to);
    return computeCashFlow(invoices, range, today);
  }

  async summary(userId: string, direction?: InvoiceDirection) {
    const [invoiceCount, recent] = await Promise.all([
      this.invoices.countForUser(userId, direction),
      this.invoices.findRecent(userId, RECENT_INVOICES, direction),
    ]);
    return { invoiceCount, recentInvoices: recent.map(toInvoiceSummaryView) };
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
