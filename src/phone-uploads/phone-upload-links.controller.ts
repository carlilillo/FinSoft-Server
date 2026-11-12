import { Controller, Get, HttpCode, HttpStatus, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth/public.decorator.js';
import { MAX_IMPORT_FILES } from '../imports/domain/import-file.js';
import {
  IMPORT_FILES_FIELD,
  IMPORT_UPLOAD_OPTIONS,
  toIncomingFiles,
  type UploadedInvoiceFile,
} from '../imports/import-upload.js';
import { PhoneUploadsService } from './phone-uploads.service.js';

/** Phone side: no session, the link's token is the credential. Expired or used links answer 410 Gone. */
@Public()
@Controller('phone-upload-links')
export class PhoneUploadLinksController {
  constructor(private readonly phoneUploads: PhoneUploadsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  describe(@Param('token') token: string) {
    return this.phoneUploads.describe(token);
  }

  /** Multipart upload (`files`, up to 10 PDFs or images) that starts the link owner's extraction session. */
  @Post(':token/files')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor(IMPORT_FILES_FIELD, MAX_IMPORT_FILES, IMPORT_UPLOAD_OPTIONS))
  submit(@Param('token') token: string, @UploadedFiles() files: UploadedInvoiceFile[] | undefined) {
    return this.phoneUploads.submit(token, toIncomingFiles(files));
  }
}
