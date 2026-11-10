export const ANALYSIS_QUEUE = 'analysis';

export type AnalysisJob =
  | { kind: 'start'; userId: string; runId: string }
  | { kind: 'continue'; userId: string; runId: string; message: string }
  | { kind: 'import'; userId: string; runId: string };

/** Fired by each user's weekly pg-boss schedule (schedule key = user id); starts a Gmail analysis. */
export const SCHEDULED_ANALYSIS_QUEUE = 'scheduled-analysis';

export type ScheduledAnalysisJob = { userId: string };
