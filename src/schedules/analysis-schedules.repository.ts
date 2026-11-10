import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AnalysisScheduleState } from './domain/analysis-schedule.js';
import { AnalysisScheduleEntity } from './entities/analysis-schedule.entity.js';

@Injectable()
export class AnalysisSchedulesRepository {
  constructor(@InjectRepository(AnalysisScheduleEntity) private readonly repo: Repository<AnalysisScheduleEntity>) {}

  findByUser(userId: string): Promise<AnalysisScheduleEntity | null> {
    return this.repo.findOne({ where: { userId } });
  }

  findEnabled(): Promise<AnalysisScheduleEntity[]> {
    return this.repo.find({ where: { enabled: true } });
  }

  async upsert(schedule: AnalysisScheduleState): Promise<void> {
    await this.repo.upsert(schedule, ['userId']);
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}
