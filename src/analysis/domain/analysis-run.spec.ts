import { type ActiveRuns, AnalysisRun, isRunActive, MAX_ACTIVE_RUNS } from './analysis-run.js';
import {
  GmailRunAlreadyActiveError,
  ImportRunNotContinuableError,
  RunLimitReachedError,
  RunNotContinuableError,
} from './analysis-run.errors.js';

const now = new Date('2026-11-09T10:00:00Z');
const none: ActiveRuns = { total: 0, gmail: 0 };
const imports = (count: number): ActiveRuns => ({ total: count, gmail: 0 });

describe('AnalysisRun', () => {
  it('starts pending while the user is under the active-run limit', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', active: imports(MAX_ACTIVE_RUNS - 1) });
    expect(run.toState()).toMatchObject({ status: 'pending', source: 'gmail' });
    expect(isRunActive(run.toState().status)).toBe(true);
  });

  it(`allows at most ${MAX_ACTIVE_RUNS} active runs per user`, () => {
    expect(() => AnalysisRun.start({ id: 'run-4', userId: 'user_1', active: imports(MAX_ACTIVE_RUNS) })).toThrow(
      RunLimitReachedError,
    );
    expect(() =>
      AnalysisRun.startImport({ id: 'run-4', userId: 'user_1', active: imports(MAX_ACTIVE_RUNS), documentsTotal: 2 }),
    ).toThrow(RunLimitReachedError);
  });

  it('never extracts the Gmail inbox twice at the same time', () => {
    const gmailRunning: ActiveRuns = { total: 1, gmail: 1 };
    expect(() => AnalysisRun.start({ id: 'run-2', userId: 'user_1', active: gmailRunning })).toThrow(
      GmailRunAlreadyActiveError,
    );
    // Imports are not inbox extractions: they may run alongside it.
    expect(() =>
      AnalysisRun.startImport({ id: 'run-2', userId: 'user_1', active: gmailRunning, documentsTotal: 1 }),
    ).not.toThrow();
  });

  it('moves through ingestion, extraction and review', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', active: none });
    run.beginIngestion();
    run.beginExtraction(12);
    expect(run.toState()).toMatchObject({ status: 'extracting', emailsTotal: 12, invocationCount: 1 });
    run.complete(now);
    expect(run.toState()).toMatchObject({ status: 'awaiting_review', finishedAt: now });
  });

  it('starts an import session that goes straight to document extraction', () => {
    const run = AnalysisRun.startImport({ id: 'run-1', userId: 'user_1', active: none, documentsTotal: 4 });
    expect(run.toState()).toMatchObject({ source: 'upload', status: 'pending', documentsTotal: 4, emailsTotal: 0 });
    run.beginDocumentExtraction();
    expect(run.toState()).toMatchObject({ status: 'extracting', stageDetail: 'Reading 4 documents', invocationCount: 1 });
  });

  it('can be continued only once finished', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', active: none });
    expect(() => run.requestContinuation({ total: 1, gmail: 1 })).toThrow(RunNotContinuableError);
    run.fail('boom', now);
    run.requestContinuation(none);
    expect(run.toState()).toMatchObject({ status: 'pending', error: null, finishedAt: null });
  });

  it('cannot be continued while the user is at the active-run limit', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', active: none });
    run.complete(now);
    expect(() => run.requestContinuation(imports(MAX_ACTIVE_RUNS))).toThrow(RunLimitReachedError);
  });

  it('cannot be continued while another inbox extraction is running', () => {
    const run = AnalysisRun.start({ id: 'run-1', userId: 'user_1', active: none });
    run.complete(now);
    expect(() => run.requestContinuation({ total: 1, gmail: 1 })).toThrow(GmailRunAlreadyActiveError);
  });

  it('never continues an import session', () => {
    const run = AnalysisRun.startImport({ id: 'run-1', userId: 'user_1', active: none, documentsTotal: 1 });
    run.complete(now);
    expect(() => run.requestContinuation(none)).toThrow(ImportRunNotContinuableError);
  });
});
