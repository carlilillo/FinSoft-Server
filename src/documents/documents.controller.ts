import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { DocumentsService } from './documents.service.js';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-url')
  createUploadUrl(@CurrentUser() auth: AuthContext, @Body() dto: CreateUploadUrlDto) {
    return this.documentsService.createUploadUrl(auth.userId, dto);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.documentsService.confirmUpload(auth.userId, id);
  }

  @Get(':id/download-url')
  downloadUrl(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.documentsService.downloadUrl(auth.userId, id);
  }
}
