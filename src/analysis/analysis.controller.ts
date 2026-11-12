import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { MAX_IMPORT_FILES } from '../imports/domain/import-file.js';
import {
  IMPORT_FILES_FIELD,
  IMPORT_UPLOAD_OPTIONS,
  toIncomingFiles,
  type UploadedInvoiceFile,
} from '../imports/import-upload.js';
import { AnalysisService } from './analysis.service.js';
import { ContinueAnalysisDto } from './dto/continue-analysis.dto.js';

@Controller('analyses')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  start(@CurrentUser() auth: AuthContext) {
    return this.analysisService.start(auth.userId);
  }

  /** Multipart upload (`files`, up to 10 PDFs or images) that starts an extraction session without Gmail. */
  @Post('imports')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor(IMPORT_FILES_FIELD, MAX_IMPORT_FILES, IMPORT_UPLOAD_OPTIONS))
  import(@CurrentUser() auth: AuthContext, @UploadedFiles() files: UploadedInvoiceFile[] | undefined) {
    return this.analysisService.importDocuments(auth.userId, toIncomingFiles(files));
  }

  @Get()
  list(@CurrentUser() auth: AuthContext) {
    return this.analysisService.list(auth.userId);
  }

  @Get(':id')
  get(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.analysisService.get(auth.userId, id);
  }

  @Post(':id/continue')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  continue(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string, @Body() dto: ContinueAnalysisDto) {
    return this.analysisService.continue(auth.userId, id, dto);
  }
}
