import { InvalidScheduleError } from './analysis-schedule.errors.js';

/** Days in the order the week is shown to the user; the index is not the cron day number. */
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Cron numbers Sunday 0 and Monday 1. */
const CRON_DAY: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export interface AnalysisScheduleState {
  userId: string;
  enabled: boolean;
  weekday: Weekday;
  /** Hour of the day, 0 to 23, in `timeZone`. Runs always start on the hour. */
  hour: number;
  /** IANA zone the hour is read in, so 09:00 stays 09:00 for the user across DST changes. */
  timeZone: string;
}

/** What a user who has never saved a schedule sees: off, Monday morning. */
export function defaultSchedule(userId: string): AnalysisScheduleState {
  return { userId, enabled: false, weekday: 'monday', hour: 9, timeZone: 'UTC' };
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Business rule: one analysis a week, on a whole hour, in a zone the scheduler can evaluate. */
export function buildSchedule(props: AnalysisScheduleState): AnalysisScheduleState {
  if (!isWeekday(props.weekday)) throw new InvalidScheduleError('The day must be a day of the week.');
  if (!Number.isInteger(props.hour) || props.hour < 0 || props.hour > 23) {
    throw new InvalidScheduleError('The hour must be a whole hour between 0 and 23.');
  }
  if (!isTimeZone(props.timeZone)) throw new InvalidScheduleError(`"${props.timeZone}" is not a known time zone.`);
  return { ...props };
}

/** Minute 0 of `hour` on `weekday`, every week. */
export function toCronExpression(schedule: Pick<AnalysisScheduleState, 'weekday' | 'hour'>): string {
  return `0 ${schedule.hour} * * ${CRON_DAY[schedule.weekday]}`;
}
