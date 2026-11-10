import { Injectable } from '@nestjs/common';
import { toInvoiceSummaryView } from '../invoices/dto/invoice.views.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';
import { computeSpendSeries, type SpendRange, spendWindow } from './domain/spend-series.js';

@Injectable()
export class InsightsService {
  constructor(private readonly invoices: InvoicesRepository) {}

  async spend(userId: string, range: SpendRange, today = todayIso()) {
    const window = spendWindow(range, today);
    const invoices = await this.invoices.findForSpend(userId, window.previousFrom, window.to);
    return computeSpendSeries(invoices, range, today);
  }

  async summary(userId: string) {
    const [invoiceCount, recent] = await Promise.all([
      this.invoices.countForUser(userId),
      this.invoices.findRecent(userId, 5),
    ]);
    return { invoiceCount, recentInvoices: recent.map(toInvoiceSummaryView) };
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
