import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { HumanMessage } from 'langchain';
import { mapAgentChunk } from './domain/agent-events.js';
import { type InvoiceAgent, InvoiceAgentFactory } from './invoice-agent.factory.js';

export interface AgentInvocation {
  userId: string;
  /** Analysis run id, used as the LangGraph thread_id. */
  threadId: string;
  /** null resumes the thread from its last checkpoint (retry after a crash). */
  message: string | null;
}

const RECURSION_LIMIT = 500;

/**
 * Runs the deep agent on a thread and writes a structured log line for every step
 * (reasoning summaries, todos, tool calls, subagent delegations). Nothing is streamed to the user.
 */
@Injectable()
export class AgentRunnerService implements OnModuleInit {
  private readonly logger = new Logger('AgentRun');
  private agent!: InvoiceAgent;

  constructor(private readonly factory: InvoiceAgentFactory) {}

  onModuleInit(): void {
    this.agent = this.factory.create();
  }

  /** Returns the coordinator's last message (its run summary). */
  async run(invocation: AgentInvocation, signal?: AbortSignal): Promise<string> {
    const { userId, threadId } = invocation;
    const input = invocation.message === null ? null : { messages: [new HumanMessage(invocation.message)] };
    const startedAt = Date.now();
    this.logger.log({ runId: threadId, userId, event: 'run.started', resumed: invocation.message === null });

    const stream = await this.agent.stream(input as never, {
      configurable: { thread_id: threadId, user_id: userId },
      context: { userId },
      streamMode: ['updates', 'custom'],
      subgraphs: true,
      recursionLimit: RECURSION_LIMIT,
      signal,
    });

    let summary = '';
    for await (const chunk of stream as AsyncIterable<[string[], string, unknown]>) {
      const [namespace, mode, data] = chunk;
      for (const event of mapAgentChunk(namespace, mode, data)) {
        this.logger.log({ runId: threadId, userId, ...event });
        if (event.event === 'agent.message' && event.agent === 'invoice-triage') summary = event.text;
      }
    }
    this.logger.log({ runId: threadId, userId, event: 'run.finished', durationMs: Date.now() - startedAt });
    return summary;
  }
}
