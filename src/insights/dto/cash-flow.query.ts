import { IsIn, IsOptional } from 'class-validator';
import type { CashFlowRange } from '../domain/cash-flow.js';

export class CashFlowQueryDto {
  @IsOptional()
  @IsIn(['7d', '14d', '30d'])
  range: CashFlowRange = '7d';
}
