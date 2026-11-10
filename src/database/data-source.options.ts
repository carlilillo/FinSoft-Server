import type { DataSourceOptions } from 'typeorm';
import { InitialSchema1762646400000 } from './migrations/1762646400000-initial-schema.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { GmailConnectionEntity } from '../gmail/entities/gmail-connection.entity.js';
import { AnalysisRunEntity } from '../analysis/entities/analysis-run.entity.js';
import { EmailEntity } from '../emails/entities/email.entity.js';
import { VendorEntity } from '../invoices/entities/vendor.entity.js';
import { InvoiceEntity } from '../invoices/entities/invoice.entity.js';
import { InvoiceLineEntity } from '../invoices/entities/invoice-line.entity.js';
import { ProductEntity } from '../products/entities/product.entity.js';
import { InvoiceDocumentEntity } from '../documents/entities/invoice-document.entity.js';

export const ENTITIES = [
  UserEntity,
  GmailConnectionEntity,
  AnalysisRunEntity,
  EmailEntity,
  VendorEntity,
  InvoiceEntity,
  InvoiceLineEntity,
  ProductEntity,
  InvoiceDocumentEntity,
];

export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: [InitialSchema1762646400000],
    synchronize: false,
    ssl: requiresSsl(url) ? { rejectUnauthorized: false } : undefined,
  };
}

function requiresSsl(url: string): boolean {
  return /sslmode=(require|verify-ca|verify-full)/.test(url);
}
