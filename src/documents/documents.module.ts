import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { InvoiceDocumentEntity } from './entities/invoice-document.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceDocumentEntity]), InvoicesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
