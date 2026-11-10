import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ACTIVE_RUN_STATUSES, type AnalysisRunState } from './domain/analysis-run.js';
import { AnalysisRunEntity } from './entities/analysis-run.entity.js';

@Injectable()
export class AnalysisRunsRepository {
  constructor(@InjectRepository(AnalysisRunEntity) private readonly repo: Repository<AnalysisRunEntity>) {}

  save(run: Partial<AnalysisRunEntity> & { id: string }): Promise<AnalysisRunEntity> {
    return this.repo.save(this.repo.create(run));
  }

  findOwned(userId: string, id: string): Promise<AnalysisRunEntity | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findById(id: string): Promise<AnalysisRunEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Starts (or restarts) a run while holding a per-user lock, so concurrent requests can never push a
   * user past the active-run limit: `decide` receives the number of active runs and returns the run
   * to save, or throws (nothing is saved).
   */
  saveExclusive(userId: string, decide: (activeRunCount: number) => AnalysisRunState): Promise<AnalysisRunState> {
    return this.repo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`analysis-runs:${userId}`]);
      const activeRunCount = await manager.count(AnalysisRunEntity, {
        where: { userId, status: In([...ACTIVE_RUN_STATUSES]) },
      });
      const run = decide(activeRunCount);
      await manager.save(AnalysisRunEntity, manager.create(AnalysisRunEntity, run));
      return run;
    });
  }

  findAllForUser(userId: string): Promise<AnalysisRunEntity[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  listForUser(userId: string, limit: number): Promise<AnalysisRunEntity[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
  }
}
