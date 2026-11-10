import { IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { WEEKDAYS, type Weekday } from '../domain/analysis-schedule.js';

export class UpdateAnalysisScheduleDto {
  @IsBoolean()
  enabled: boolean;

  @IsIn(WEEKDAYS)
  weekday: Weekday;

  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;

  /** The browser's IANA time zone, e.g. "Europe/Dublin". */
  @IsString()
  @MaxLength(64)
  timeZone: string;
}
