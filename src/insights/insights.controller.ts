import { Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { DirectionFilterQueryDto } from '../invoices/dto/direction-filter.query.js';
import { CashFlowQueryDto } from './dto/cash-flow.query.js';
import { InsightsService } from './insights.service.js';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /** Daily totals of the invoices the user issued (income) and received (spend), per currency. */
  @Get('cash-flow')
  cashFlow(@CurrentUser() auth: AuthContext, @Query() query: CashFlowQueryDto) {
    return this.insightsService.cashFlow(auth.userId, query.range);
  }

  /** Invoice count and latest invoices, optionally only those the user issued or received. */
  @Get('summary')
  summary(@CurrentUser() auth: AuthContext, @Query() query: DirectionFilterQueryDto) {
    return this.insightsService.summary(auth.userId, query.direction);
  }
}
