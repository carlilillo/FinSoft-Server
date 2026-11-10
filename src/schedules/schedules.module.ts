import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { GmailModule } from '../gmail/gmail.module.js';
import { AnalysisSchedulesController } from './analysis-schedules.controller.js';
import { AnalysisSchedulesRepository } from './analysis-schedules.repository.js';
import { AnalysisSchedulesService } from './analysis-schedules.service.js';
import { AnalysisScheduleEntity } from './entities/analysis-schedule.entity.js';
import { ScheduledAnalysisProcessor } from './scheduled-analysis.processor.js';

@Module({
  imports: [TypeOrmModule.forFeature([AnalysisScheduleEntity]), AnalysisModule, GmailModule],
  controllers: [AnalysisSchedulesController],
  providers: [AnalysisSchedulesService, AnalysisSchedulesRepository, ScheduledAnalysisProcessor],
  exports: [AnalysisSchedulesService],
})
export class SchedulesModule {}
