import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AgentModule } from './agent/agent.module.js';
import { AnalysisModule } from './analysis/analysis.module.js';
import { ClerkAuthGuard } from './common/auth/clerk-auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { DomainErrorFilter } from './common/errors/domain-error.filter.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EmailsModule } from './emails/emails.module.js';
import { GmailModule } from './gmail/gmail.module.js';
import { HealthModule } from './health/health.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ProductsModule } from './products/products.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: { ignore: (request) => request.url === '/health' },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    CommonModule,
    StorageModule,
    JobsModule,
    HealthModule,
    UsersModule,
    GmailModule,
    EmailsModule,
    InvoicesModule,
    ProductsModule,
    DocumentsModule,
    InsightsModule,
    AgentModule,
    AnalysisModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
