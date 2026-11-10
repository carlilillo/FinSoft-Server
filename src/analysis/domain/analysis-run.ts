import { RunAlreadyActiveError, RunNotContinuableError } from './analysis-run.errors.js';

export type RunStatus = 'pending' | 'ingesting' | 'extracting' | 'awaiting_review' | 'failed';

export interface AnalysisRunState {
  id: string;
  userId: string;
  status: RunStatus;
  stageDetail: string | null;
  emailsTotal: number;
  error: string | null;
  invocationCount: number;
  finishedAt: Date | null;
}

const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(['pending', 'ingesting', 'extracting']);

export function isRunActive(status: RunStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** Lifecycle of one analysis session (= one LangGraph thread). */
export class AnalysisRun {
  private constructor(private state: AnalysisRunState) {}

  static from(state: AnalysisRunState): AnalysisRun {
    return new AnalysisRun({ ...state });
  }

  /** A user may only have one active analysis at a time. */
  static start(props: { id: string; userId: string; activeRunId: string | null }): AnalysisRun {
    if (props.activeRunId) throw new RunAlreadyActiveError(props.activeRunId);
    return new AnalysisRun({
      id: props.id,
      userId: props.userId,
      status: 'pending',
      stageDetail: 'Waiting to start',
      emailsTotal: 0,
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

  complete(now: Date): void {
    this.state = { ...this.state, status: 'awaiting_review', stageDetail: null, finishedAt: now };
  }

  fail(reason: string, now: Date): void {
    this.state = { ...this.state, status: 'failed', stageDetail: null, error: reason, finishedAt: now };
  }

  /** The user asked to re-run the same thread with a corrected email selection. */
  requestContinuation(activeRunId: string | null): void {
    if (isRunActive(this.state.status)) throw new RunNotContinuableError(this.state.id, this.state.status);
    if (activeRunId && activeRunId !== this.state.id) throw new RunAlreadyActiveError(activeRunId);
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
