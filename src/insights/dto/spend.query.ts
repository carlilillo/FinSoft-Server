import { IsIn, IsOptional } from 'class-validator';
import type { SpendRange } from '../domain/spend-series.js';

export class SpendQueryDto {
  @IsOptional()
  @IsIn(['7d', '14d', '30d'])
  range: SpendRange = '7d';
}
