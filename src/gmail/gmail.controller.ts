import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { CreateConsentUrlDto } from './dto/create-consent-url.dto.js';
import { GmailService } from './gmail.service.js';

@Controller('gmail')
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @Post('oauth/url')
  createConsentUrl(@CurrentUser() auth: AuthContext, @Body() dto: CreateConsentUrlDto): { url: string } {
    return { url: this.gmailService.buildConsentUrl(auth.userId, dto.intent) };
  }

  @Get('connections')
  list(@CurrentUser() auth: AuthContext) {
    return this.gmailService.listConnections(auth.userId);
  }

  @Delete('connections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string): Promise<void> {
    return this.gmailService.disconnect(auth.userId, id);
  }
}
