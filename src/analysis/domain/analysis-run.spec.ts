import { AnalysisRun, isRunActive } from './analysis-run.js';
import { RunAlreadyActiveError, RunNotContinuableError } from './analysis-run.errors.js';

const now = new Date('2026-11-09T10:00:00Z');

describe('AnalysisRun', () => {
  it('starts pending when the user has no active run', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunId: null });
    expect(run.toState().status).toBe('pending');
    expect(isRunActive(run.toState().status)).toBe(true);
  });

  it('allows only one active run per user', () => {
    expect(() => AnalysisRun.start({ id: 'run-2', userId: 'user_1', activeRunId: 'run-1' })).toThrow(RunAlreadyActiveError);
  });

  it('moves through ingestion, extraction and review', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunId: null });
    run.beginIngestion();
    run.beginExtraction(12);
    expect(run.toState()).toMatchObject({ status: 'extracting', emailsTotal: 12, invocationCount: 1 });
    run.complete(now);
    expect(run.toState()).toMatchObject({ status: 'awaiting_review', finishedAt: now });
  });

  it('can be continued only once finished', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunId: null });
    expect(() => run.requestContinuation(null)).toThrow(RunNotContinuableError);
    run.fail('boom', now);
    run.requestContinuation(null);
    expect(run.toState()).toMatchObject({ status: 'pending', error: null, finishedAt: null });
  });

  it('cannot be continued while another run of the user is active', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunId: null });
    run.complete(now);
    expect(() => run.requestContinuation('run-9')).toThrow(RunAlreadyActiveError);
  });
});
