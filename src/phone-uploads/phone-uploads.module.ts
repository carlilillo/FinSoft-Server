import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { PhoneUploadLinkEntity } from './entities/phone-upload-link.entity.js';
import { PhoneUploadLinksController } from './phone-upload-links.controller.js';
import { PhoneUploadLinksRepository } from './phone-upload-links.repository.js';
import { PhoneUploadsController } from './phone-uploads.controller.js';
import { PhoneUploadsService } from './phone-uploads.service.js';

/** Importing invoices from a phone through a single-use QR link; the import itself is AnalysisService's. */
@Module({
  imports: [TypeOrmModule.forFeature([PhoneUploadLinkEntity]), AnalysisModule],
  controllers: [PhoneUploadsController, PhoneUploadLinksController],
  providers: [PhoneUploadsService, PhoneUploadLinksRepository],
})
export class PhoneUploadsModule {}
