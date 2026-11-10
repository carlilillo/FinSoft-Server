import { Controller, Get, Param } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { DocumentsService } from './documents.service.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':id/download-url')
  downloadUrl(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.documentsService.downloadUrl(auth.userId, id);
  }
}
