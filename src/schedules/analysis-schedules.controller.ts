import { Body, Controller, Get, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { AnalysisSchedulesService } from './analysis-schedules.service.js';
import { UpdateAnalysisScheduleDto } from './dto/update-analysis-schedule.dto.js';

@Controller('analysis-schedule')
export class AnalysisSchedulesController {
  constructor(private readonly schedulesService: AnalysisSchedulesService) {}

  @Get()
  get(@CurrentUser() auth: AuthContext) {
    return this.schedulesService.get(auth.userId);
  }

  @Put()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  update(@CurrentUser() auth: AuthContext, @Body() dto: UpdateAnalysisScheduleDto) {
    return this.schedulesService.update(auth.userId, dto);
  }
}
