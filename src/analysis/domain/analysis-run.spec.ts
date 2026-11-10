import { AnalysisRun, isRunActive, MAX_ACTIVE_RUNS } from './analysis-run.js';
import { ImportRunNotContinuableError, RunLimitReachedError, RunNotContinuableError } from './analysis-run.errors.js';

const now = new Date('2026-11-09T10:00:00Z');

describe('AnalysisRun', () => {
  it('starts pending while the user is under the active-run limit', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunCount: MAX_ACTIVE_RUNS - 1 });
    expect(run.toState()).toMatchObject({ status: 'pending', source: 'gmail' });
    expect(isRunActive(run.toState().status)).toBe(true);
  });

  it(`allows at most ${MAX_ACTIVE_RUNS} active runs per user`, () => {
    expect(() => AnalysisRun.start({ id: 'run-4', userId: 'user_1', activeRunCount: MAX_ACTIVE_RUNS })).toThrow(
      RunLimitReachedError,
    );
    expect(() =>
      AnalysisRun.startImport({ id: 'run-4', userId: 'user_1', activeRunCount: MAX_ACTIVE_RUNS, documentsTotal: 2 }),
    ).toThrow(RunLimitReachedError);
  });

  it('moves through ingestion, extraction and review', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunCount: 0 });
    run.beginIngestion();
    run.beginExtraction(12);
    expect(run.toState()).toMatchObject({ status: 'extracting', emailsTotal: 12, invocationCount: 1 });
    run.complete(now);
    expect(run.toState()).toMatchObject({ status: 'awaiting_review', finishedAt: now });
  });

  it('starts an import session that goes straight to document extraction', () => {
    const run = AnalysisRun.startImport({ id: 'run-1', userId: 'user_1', activeRunCount: 0, documentsTotal: 4 });
    expect(run.toState()).toMatchObject({ source: 'upload', status: 'pending', documentsTotal: 4, emailsTotal: 0 });
    run.beginDocumentExtraction();
    expect(run.toState()).toMatchObject({ status: 'extracting', stageDetail: 'Reading 4 documents', invocationCount: 1 });
  });

  it('can be continued only once finished', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunCount: 0 });
    expect(() => run.requestContinuation(1)).toThrow(RunNotContinuableError);
    run.fail('boom', now);
    run.requestContinuation(0);
    expect(run.toState()).toMatchObject({ status: 'pending', error: null, finishedAt: null });
  });

  it('cannot be continued while the user is at the active-run limit', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', activeRunCount: 0 });
    run.complete(now);
    expect(() => run.requestContinuation(MAX_ACTIVE_RUNS)).toThrow(RunLimitReachedError);
  });

  it('never continues an import session', () => {
    const run = AnalysisRun.startImport({ id: 'run-1', userId: 'user_1', activeRunCount: 0, documentsTotal: 1 });
    run.complete(now);
    expect(() => run.requestContinuation(0)).toThrow(ImportRunNotContinuableError);
  });
});
