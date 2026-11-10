import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { GmailService } from './gmail.service.js';

@Controller('gmail')
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @Post('oauth/url')
  createConsentUrl(@CurrentUser() auth: AuthContext): { url: string } {
    return { url: this.gmailService.buildConsentUrl(auth.userId) };
  }

  @Get('connection')
  status(@CurrentUser() auth: AuthContext) {
    return this.gmailService.getStatus(auth.userId);
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() auth: AuthContext): Promise<void> {
    return this.gmailService.disconnect(auth.userId);
  }
}
