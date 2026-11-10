import { buildSchedule, defaultSchedule, isTimeZone, toCronExpression, type AnalysisScheduleState } from './analysis-schedule.js';
import { InvalidScheduleError } from './analysis-schedule.errors.js';

const valid: AnalysisScheduleState = {
  userId: 'user_1',
  enabled: true,
  weekday: 'friday',
  hour: 18,
  timeZone: 'Europe/Dublin',
};

describe('analysis schedule', () => {
  it('starts off, on Monday at 09:00', () => {
    expect(defaultSchedule('user_1')).toEqual({
      userId: 'user_1',
      enabled: false,
      weekday: 'monday',
      hour: 9,
      timeZone: 'UTC',
    });
  });

  it('runs on minute 0 of the chosen hour, with Sunday as cron day 0', () => {
    expect(toCronExpression({ weekday: 'monday', hour: 9 })).toBe('0 9 * * 1');
    expect(toCronExpression({ weekday: 'sunday', hour: 0 })).toBe('0 0 * * 0');
    expect(toCronExpression({ weekday: 'saturday', hour: 23 })).toBe('0 23 * * 6');
  });

  it('accepts a whole hour on a weekday in a known zone', () => {
    expect(buildSchedule(valid)).toEqual(valid);
  });

  it.each([-1, 24, 9.5, Number.NaN])('rejects hour %s', (hour) => {
    expect(() => buildSchedule({ ...valid, hour })).toThrow(InvalidScheduleError);
  });

  it('rejects an unknown day', () => {
    expect(() => buildSchedule({ ...valid, weekday: 'someday' as never })).toThrow(InvalidScheduleError);
  });

  it('rejects an unknown time zone', () => {
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(() => buildSchedule({ ...valid, timeZone: 'Mars/Olympus_Mons' })).toThrow(InvalidScheduleError);
  });
});
