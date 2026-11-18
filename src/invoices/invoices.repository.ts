import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type FindOptionsWhere, Repository } from 'typeorm';
import { InvoiceLineEntity } from './entities/invoice-line.entity.js';
import { InvoiceEntity } from './entities/invoice.entity.js';
import type { InvoiceDirection } from './domain/invoice-direction.js';
import type { ListInvoicesQueryDto } from './dto/list-invoices.query.js';

@Injectable()
export class InvoicesRepository {
  constructor(@InjectRepository(InvoiceEntity) private readonly repo: Repository<InvoiceEntity>) {}

  async list(
    userId: string,
    query: ListInvoicesQueryDto,
  ): Promise<[Array<InvoiceEntity & { lineCount: number }>, number]> {
    const qb = this.repo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .where('invoice.userId = :userId', { userId })
      .orderBy('invoice.issueDate', 'DESC')
      .addOrderBy('invoice.id', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    if (query.direction) qb.andWhere('invoice.direction = :direction', { direction: query.direction });
    if (query.vendorId) qb.andWhere('invoice.vendorId = :vendorId', { vendorId: query.vendorId });
    if (query.runId) qb.andWhere('invoice.runId = :runId', { runId: query.runId });
    if (query.from) qb.andWhere('invoice.issueDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('invoice.issueDate <= :to', { to: query.to });
    if (query.search) {
      const term = `%${query.search.replace(/[%_]/g, '\\$&')}%`;
      qb.andWhere(
        new Brackets((where) => {
          where.where('vendor.name ILIKE :term', { term }).orWhere('invoice.invoiceNumber ILIKE :term', { term });
        }),
      );
    }
    const [invoices, total] = await qb.getManyAndCount();
    const counts = await this.lineCounts(invoices.map((invoice) => invoice.id));
    return [invoices.map((invoice) => Object.assign(invoice, { lineCount: counts.get(invoice.id) ?? 0 })), total];
  }

  private async lineCounts(invoiceIds: string[]): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.repo.manager
      .createQueryBuilder(InvoiceLineEntity, 'line')
      .select('line.invoiceId', 'invoiceId')
      .addSelect('COUNT(*)::int', 'count')
      .where('line.invoiceId IN (:...invoiceIds)', { invoiceIds })
      .groupBy('line.invoiceId')
      .getRawMany<{ invoiceId: string; count: number }>();
    return new Map(rows.map((row) => [row.invoiceId, Number(row.count)]));
  }

  findDetail(userId: string, id: string): Promise<InvoiceEntity | null> {
    return this.repo.findOne({
      where: { id, userId },
      relations: { vendor: true, lines: { product: true } },
      order: { lines: { position: 'ASC' } },
    });
  }

  findOwned(userId: string, id: string): Promise<InvoiceEntity | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findForRun(userId: string, runId: string): Promise<InvoiceEntity[]> {
    return this.repo.find({
      where: { userId, runId },
      relations: { vendor: true, lines: { product: true } },
      order: { issueDate: 'DESC' },
    });
  }

  findIdsForImportFile(userId: string, importFileId: string): Promise<string[]> {
    return this.repo
      .find({ where: { userId, importFileId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
  }

  findForCashFlow(
    userId: string,
    from: string,
    to: string,
  ): Promise<Array<Pick<InvoiceEntity, 'direction' | 'issueDate' | 'currency' | 'total'>>> {
    return this.repo
      .createQueryBuilder('invoice')
      .select(['invoice.direction', 'invoice.issueDate', 'invoice.currency', 'invoice.total'])
      .where('invoice.userId = :userId', { userId })
      .andWhere('invoice.issueDate BETWEEN :from AND :to', { from, to })
      .getMany();
  }

  /** Newest invoices first; `direction` keeps only those the user issued or received. */
  findRecent(userId: string, limit: number, direction?: InvoiceDirection): Promise<InvoiceEntity[]> {
    return this.repo.find({
      where: ownedWhere(userId, direction),
      relations: { vendor: true },
      order: { issueDate: 'DESC', id: 'DESC' },
      take: limit,
    });
  }

  countForUser(userId: string, direction?: InvoiceDirection): Promise<number> {
    return this.repo.count({ where: ownedWhere(userId, direction) });
  }
}

/**
 * The user's invoices, optionally of one direction. TypeORM refuses `undefined` in a where condition, so the
 * direction is only added when there is one.
 */
function ownedWhere(userId: string, direction?: InvoiceDirection): FindOptionsWhere<InvoiceEntity> {
  return direction ? { userId, direction } : { userId };
}
