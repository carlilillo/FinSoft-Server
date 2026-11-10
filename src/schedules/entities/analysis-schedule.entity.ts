import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN } from '../../database/column-types.js';
import type { Weekday } from '../domain/analysis-schedule.js';

/**
 * The user's weekly Gmail analysis: the source of truth for the pg-boss schedule of the same user,
 * which is re-created from these rows on every boot. Kept when disabled so the day and hour survive.
 */
@Entity('analysis_schedules')
export class AnalysisScheduleEntity {
  @PrimaryColumn({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 9 })
  weekday: Weekday;

  @Column({ type: 'smallint' })
  hour: number;

  @Column({ name: 'time_zone', type: 'varchar', length: 64 })
  timeZone: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
