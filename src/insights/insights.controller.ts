import { Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { SpendQueryDto } from './dto/spend.query.js';
import { InsightsService } from './insights.service.js';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('spend')
  spend(@CurrentUser() auth: AuthContext, @Query() query: SpendQueryDto) {
    return this.insightsService.spend(auth.userId, query.range);
  }

  @Get('summary')
  summary(@CurrentUser() auth: AuthContext) {
    return this.insightsService.summary(auth.userId);
  }
}
