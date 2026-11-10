import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  findActiveForUser(userId: string): Promise<AnalysisRunEntity | null> {
    return this.repo.findOne({
      where: { userId, status: In(['pending', 'ingesting', 'extracting']) },
      order: { createdAt: 'DESC' },
    });
  }

  findAllForUser(userId: string): Promise<AnalysisRunEntity[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  listForUser(userId: string, limit: number): Promise<AnalysisRunEntity[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
  }
}
