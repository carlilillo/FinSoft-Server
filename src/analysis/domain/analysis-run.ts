import { ImportRunNotContinuableError, RunLimitReachedError, RunNotContinuableError } from './analysis-run.errors.js';

export type RunStatus = 'pending' | 'ingesting' | 'extracting' | 'awaiting_review' | 'failed';

/** Where the session's documents come from: the Gmail inbox, or PDFs the user imported by hand. */
export type RunSource = 'gmail' | 'upload';

export interface AnalysisRunState {
  id: string;
  userId: string;
  source: RunSource;
  status: RunStatus;
  stageDetail: string | null;
  emailsTotal: number;
  documentsTotal: number;
  error: string | null;
  invocationCount: number;
  finishedAt: Date | null;
}

/** A user may have at most this many analyses (of any source) in progress at once. */
export const MAX_ACTIVE_RUNS = 3;

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['pending', 'ingesting', 'extracting'];
const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(ACTIVE_RUN_STATUSES);

export function isRunActive(status: RunStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function assertCanStartRun(activeRunCount: number): void {
  if (activeRunCount >= MAX_ACTIVE_RUNS) throw new RunLimitReachedError(MAX_ACTIVE_RUNS);
}

/** Lifecycle of one analysis session. Gmail sessions are one LangGraph thread; imports run one thread per document. */
export class AnalysisRun {
  private constructor(private state: AnalysisRunState) {}

  static from(state: AnalysisRunState): AnalysisRun {
    return new AnalysisRun({ ...state });
  }

  static start(props: { id: string; userId: string; activeRunCount: number }): AnalysisRun {
    assertCanStartRun(props.activeRunCount);
    return new AnalysisRun({
      id: props.id,
      userId: props.userId,
      source: 'gmail',
      status: 'pending',
      stageDetail: 'Waiting to start',
      emailsTotal: 0,
      documentsTotal: 0,
      error: null,
      invocationCount: 0,
      finishedAt: null,
    });
  }

  /** A session fed by PDFs the user imported: no inbox, every document goes straight to extraction. */
  static startImport(props: { id: string; userId: string; activeRunCount: number; documentsTotal: number }): AnalysisRun {
    assertCanStartRun(props.activeRunCount);
    return new AnalysisRun({
      id: props.id,
      userId: props.userId,
      source: 'upload',
      status: 'pending',
      stageDetail: 'Waiting to start',
      emailsTotal: 0,
      documentsTotal: props.documentsTotal,
      error: null,
      invocationCount: 0,
      finishedAt: null,
    });
  }

  beginIngestion(): void {
    this.state = { ...this.state, status: 'ingesting', stageDetail: 'Fetching your emails', error: null };
  }

  beginExtraction(emailsTotal: number): void {
    this.state = {
      ...this.state,
      status: 'extracting',
      emailsTotal,
      stageDetail: `Reviewing ${emailsTotal} emails`,
      invocationCount: this.state.invocationCount + 1,
      error: null,
    };
  }

  beginDocumentExtraction(): void {
    this.state = {
      ...this.state,
      status: 'extracting',
      stageDetail: `Reading ${this.state.documentsTotal} documents`,
      invocationCount: this.state.invocationCount + 1,
      error: null,
    };
  }

  complete(now: Date): void {
    this.state = { ...this.state, status: 'awaiting_review', stageDetail: null, finishedAt: now };
  }

  fail(reason: string, now: Date): void {
    this.state = { ...this.state, status: 'failed', stageDetail: null, error: reason, finishedAt: now };
  }

  /** The user asked to re-run the same thread with a corrected email selection. */
  requestContinuation(activeRunCount: number): void {
    if (this.state.source === 'upload') throw new ImportRunNotContinuableError();
    if (isRunActive(this.state.status)) throw new RunNotContinuableError(this.state.id, this.state.status);
    assertCanStartRun(activeRunCount);
    this.state = {
      ...this.state,
      status: 'pending',
      stageDetail: 'Waiting to re-run with your selection',
      error: null,
      finishedAt: null,
    };
  }

  toState(): AnalysisRunState {
    return { ...this.state };
  }
}
