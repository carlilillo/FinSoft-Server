import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/auth/public.decorator.js';
import { AppConfigService } from '../config/app-config.service.js';
import { GmailService } from '../gmail/gmail.service.js';
import { AnalysisService } from './analysis.service.js';

/**
 * Google redirects here after consent. Coming from Analyze, connecting Gmail is the first step of an
 * analysis: the callback stores the grant, starts the background run and sends the browser to the run
 * page. Coming from Settings ("Add Gmail account") it only stores the grant and goes back to Settings.
 */
@Controller('gmail/oauth')
export class GmailCallbackController {
  private readonly logger = new Logger(GmailCallbackController.name);

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly gmailService: GmailService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('callback')
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const clientUrl = this.config.get('CLIENT_URL');
    const originUrl = `${clientUrl}/${this.gmailService.consentIntent(state) === 'connect' ? 'settings' : 'analyze'}`;
    if (error || !code || !state) {
      response.redirect(`${originUrl}?error=${encodeURIComponent(error ?? 'missing_code')}`);
      return;
    }
    try {
      const { runId } = await this.analysisService.completeConsent(code, state);
      response.redirect(runId ? `${clientUrl}/analyses/${runId}` : originUrl);
    } catch (failure) {
      this.logger.warn({ error: (failure as Error).message }, 'Gmail consent callback failed');
      const reason = (failure as { code?: string }).code ?? 'connection_failed';
      response.redirect(`${originUrl}?error=${encodeURIComponent(reason)}`);
    }
  }
}
