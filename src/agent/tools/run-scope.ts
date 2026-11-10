import { HttpException } from '@nestjs/common';
import type { ToolRuntime } from 'langchain';
import { DomainError } from '../../common/domain/domain-error.js';

export interface RunScope {
  userId: string;
  /** LangGraph thread id = analysis run id. */
  threadId: string;
}

/**
 * The user and thread always come from the runtime (context + configurable), never from the
 * model's arguments, so a tool can only ever touch the data of the run it belongs to.
 */
export function resolveRunScope(runtime: ToolRuntime): RunScope {
  const context = (runtime.context ?? {}) as { userId?: unknown };
  const configurable = (runtime.configurable ?? runtime.config?.configurable ?? {}) as Record<string, unknown>;
  const executionInfo = (runtime as { executionInfo?: { threadId?: string } }).executionInfo;

  const userId = typeof context.userId === 'string' ? context.userId : configurable.user_id;
  const threadId = executionInfo?.threadId ?? configurable.thread_id;
  if (typeof userId !== 'string' || typeof threadId !== 'string') {
    throw new Error('Tool invoked outside of an analysis run (missing userId or thread_id)');
  }
  return { userId, threadId };
}

/** Emits a progress event on the "custom" stream (picked up by the run logger). */
export function emitEvent(runtime: ToolRuntime, event: Record<string, unknown>): void {
  runtime.writer?.(event);
}

/**
 * Business and lookup errors are returned to the model as text so it can correct itself;
 * anything unexpected is rethrown and fails the run.
 */
export async function asToolResult(work: () => Promise<string>): Promise<string> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) return `Error (${error.code}): ${error.message}`;
    if (error instanceof HttpException) return `Error: ${error.message}`;
    throw error;
  }
}
