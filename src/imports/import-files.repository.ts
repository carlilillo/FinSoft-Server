import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ImportOutcome } from './domain/import-file.js';
import { ImportFileEntity } from './entities/import-file.entity.js';

@Injectable()
export class ImportFilesRepository {
  constructor(
    @InjectRepository(ImportFileEntity)
    private readonly repo: Repository<ImportFileEntity>,
  ) {}

  async insertMany(files: Array<Omit<ImportFileEntity, 'createdAt'>>): Promise<void> {
    if (files.length === 0) return;
    await this.repo.insert(files);
  }

  findForRun(userId: string, runId: string): Promise<ImportFileEntity[]> {
    return this.repo.find({ where: { userId, runId }, order: { id: 'ASC' } });
  }

  findPendingForRun(runId: string): Promise<ImportFileEntity[]> {
    return this.repo.find({
      where: { runId, status: 'pending' },
      order: { id: 'ASC' },
    });
  }

  async findIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async saveOutcome(id: string, outcome: ImportOutcome): Promise<void> {
    await this.repo.update({ id }, outcome);
  }

  async failPending(runId: string, reason: string): Promise<void> {
    await this.repo.update({ runId, status: 'pending' }, { status: 'failed', reason });
  }
}
