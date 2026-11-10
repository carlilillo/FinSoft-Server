import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EmailsModule } from '../emails/emails.module.js';
import { GmailModule } from '../gmail/gmail.module.js';
import { ImportsModule } from '../imports/imports.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { ProductsModule } from '../products/products.module.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisIngestionService } from './analysis-ingestion.service.js';
import { AnalysisProcessor } from './analysis.processor.js';
import { AnalysisRunsRepository } from './analysis-runs.repository.js';
import { AnalysisService } from './analysis.service.js';
import { AnalysisRunEntity } from './entities/analysis-run.entity.js';
import { GmailCallbackController } from './gmail-callback.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalysisRunEntity]),
    AgentModule,
    DocumentsModule,
    EmailsModule,
    GmailModule,
    ImportsModule,
    InvoicesModule,
    ProductsModule,
  ],
  controllers: [AnalysisController, GmailCallbackController],
  providers: [AnalysisService, AnalysisRunsRepository, AnalysisIngestionService, AnalysisProcessor],
  exports: [AnalysisRunsRepository, AnalysisService],
})
export class AnalysisModule {}
