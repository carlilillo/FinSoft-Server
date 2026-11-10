export const ANALYSIS_QUEUE = 'analysis';

export type AnalysisJob =
  | { kind: 'start'; userId: string; runId: string }
  | { kind: 'continue'; userId: string; runId: string; message: string }
  | { kind: 'import'; userId: string; runId: string };
