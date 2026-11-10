import { Injectable, Logger } from '@nestjs/common';
import { GmailNotConnectedError } from '../gmail/domain/oauth-state.js';
import { GmailService } from '../gmail/gmail.service.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { SCHEDULED_ANALYSIS_QUEUE, type ScheduledAnalysisJob } from '../jobs/jobs.constants.js';
import { AnalysisSchedulesRepository } from './analysis-schedules.repository.js';
import {
  type AnalysisScheduleState,
  buildSchedule,
  defaultSchedule,
  toCronExpression,
} from './domain/analysis-schedule.js';
import type { UpdateAnalysisScheduleDto } from './dto/update-analysis-schedule.dto.js';

export interface AnalysisScheduleView {
  enabled: boolean;
  weekday: AnalysisScheduleState['weekday'];
  hour: number;
  timeZone: string;
  /** When the next scheduled analysis starts, or null while the schedule is off. */
  nextRunAt: Date | null;
}

/** The user's weekly analysis: the row in analysis_schedules and its pg-boss cron schedule, kept in step. */
@Injectable()
export class AnalysisSchedulesService {
  private readonly logger = new Logger(AnalysisSchedulesService.name);

  constructor(
    private readonly schedules: AnalysisSchedulesRepository,
    private readonly gmail: GmailService,
    private readonly jobs: JobQueueService,
  ) {}

  async get(userId: string): Promise<AnalysisScheduleView> {
    const schedule = (await this.schedules.findByUser(userId)) ?? defaultSchedule(userId);
    return this.toView(schedule);
  }

  async update(userId: string, dto: UpdateAnalysisScheduleDto): Promise<AnalysisScheduleView> {
    const { enabled, weekday, hour, timeZone } = dto;
    const schedule = buildSchedule({ userId, enabled, weekday, hour, timeZone });
    if (schedule.enabled && !(await this.gmail.isConnected(userId))) throw new GmailNotConnectedError();

    await this.schedules.upsert(schedule);
    await this.sync(schedule);
    this.logger.log({ userId, enabled: schedule.enabled, cron: toCronExpression(schedule), tz: schedule.timeZone }, 'Analysis schedule saved');
    return this.toView(schedule);
  }

  /** Account deletion: the pg-boss schedule goes first; the row goes with the user (ON DELETE CASCADE). */
  async remove(userId: string): Promise<void> {
    await this.jobs.removeSchedule(SCHEDULED_ANALYSIS_QUEUE, userId);
  }

  /**
   * Makes the pg-boss schedules match the enabled rows. pg-boss already keeps its schedules across
   * restarts; this covers what it cannot know about: a pgboss schema that was reset, a save that
   * reached the row but not pg-boss, or a user deleted while their schedule was on.
   */
  async reconcile(): Promise<void> {
    const [enabled, existing] = await Promise.all([
      this.schedules.findEnabled(),
      this.jobs.listSchedules(SCHEDULED_ANALYSIS_QUEUE),
    ]);
    const existingByUser = new Map(existing.map((schedule) => [schedule.key, schedule]));
    const enabledUsers = new Set(enabled.map((schedule) => schedule.userId));

    let restored = 0;
    for (const schedule of enabled) {
      const current = existingByUser.get(schedule.userId);
      if (current?.cron === toCronExpression(schedule) && current.timeZone === schedule.timeZone) continue;
      await this.sync(schedule);
      restored += 1;
    }
    const stale = existing.filter((schedule) => !enabledUsers.has(schedule.key));
    for (const schedule of stale) await this.jobs.removeSchedule(SCHEDULED_ANALYSIS_QUEUE, schedule.key);

    this.logger.log({ enabled: enabled.length, restored, removed: stale.length }, 'Analysis schedules reconciled');
  }

  private async sync(schedule: AnalysisScheduleState): Promise<void> {
    if (!schedule.enabled) {
      await this.jobs.removeSchedule(SCHEDULED_ANALYSIS_QUEUE, schedule.userId);
      return;
    }
    await this.jobs.upsertSchedule<ScheduledAnalysisJob>(
      SCHEDULED_ANALYSIS_QUEUE,
      schedule.userId,
      toCronExpression(schedule),
      schedule.timeZone,
      { userId: schedule.userId },
    );
  }

  private async toView(schedule: AnalysisScheduleState): Promise<AnalysisScheduleView> {
    return {
      enabled: schedule.enabled,
      weekday: schedule.weekday,
      hour: schedule.hour,
      timeZone: schedule.timeZone,
      nextRunAt: schedule.enabled ? await this.jobs.nextOccurrence(toCronExpression(schedule), schedule.timeZone) : null,
    };
  }
}
