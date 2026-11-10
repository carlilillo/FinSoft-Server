import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
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
