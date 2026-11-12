import type { DataSourceOptions } from 'typeorm';
import { InitialSchema1762646400000 } from './migrations/1762646400000-initial-schema.js';
import { InvoiceImports1762819200000 } from './migrations/1762819200000-invoice-imports.js';
import { AnalysisSchedules1762905600000 } from './migrations/1762905600000-analysis-schedules.js';
import { GmailAccounts1762992000000 } from './migrations/1762992000000-gmail-accounts.js';
import { ImageImports1763078400000 } from './migrations/1763078400000-image-imports.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { GmailConnectionEntity } from '../gmail/entities/gmail-connection.entity.js';
import { AnalysisRunEntity } from '../analysis/entities/analysis-run.entity.js';
import { EmailEntity } from '../emails/entities/email.entity.js';
import { VendorEntity } from '../invoices/entities/vendor.entity.js';
import { InvoiceEntity } from '../invoices/entities/invoice.entity.js';
import { InvoiceLineEntity } from '../invoices/entities/invoice-line.entity.js';
import { ProductEntity } from '../products/entities/product.entity.js';
import { InvoiceDocumentEntity } from '../documents/entities/invoice-document.entity.js';
import { ImportFileEntity } from '../imports/entities/import-file.entity.js';
import { AnalysisScheduleEntity } from '../schedules/entities/analysis-schedule.entity.js';

export const ENTITIES = [
  UserEntity,
  GmailConnectionEntity,
  AnalysisRunEntity,
  EmailEntity,
  ImportFileEntity,
  VendorEntity,
  InvoiceEntity,
  InvoiceLineEntity,
  ProductEntity,
  InvoiceDocumentEntity,
  AnalysisScheduleEntity,
];

export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: [
      InitialSchema1762646400000,
      InvoiceImports1762819200000,
      AnalysisSchedules1762905600000,
      GmailAccounts1762992000000,
      ImageImports1763078400000,
    ],
    synchronize: false,
    ssl: requiresSsl(url) ? { rejectUnauthorized: false } : undefined,
  };
}

function requiresSsl(url: string): boolean {
  return /sslmode=(require|verify-ca|verify-full)/.test(url);
}
