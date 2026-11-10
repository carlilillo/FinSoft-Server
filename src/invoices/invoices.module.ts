import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceDocumentEntity } from '../documents/entities/invoice-document.entity.js';
import { InvoiceLineEntity } from './entities/invoice-line.entity.js';
import { InvoiceEntity } from './entities/invoice.entity.js';
import { VendorEntity } from './entities/vendor.entity.js';
import { InvoiceWriterService } from './invoice-writer.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, InvoiceLineEntity, VendorEntity, InvoiceDocumentEntity])],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoiceWriterService],
  exports: [InvoicesRepository, InvoiceWriterService],
})
export class InvoicesModule {}
