import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { HumanMessage } from 'langchain';
import { settleWithConcurrency } from '../common/async/settle-with-concurrency.js';
import { mapAgentChunk, type RootAgentName } from './domain/agent-events.js';
import { type DocumentExtractorAgent, type InvoiceAgent, InvoiceAgentFactory } from './invoice-agent.factory.js';
import { DOCUMENT_EXTRACTOR_AGENT_NAME } from './prompts/document-extractor.prompt.js';
import { TRIAGE_AGENT_NAME } from './prompts/triage.prompt.js';

export interface AgentInvocation {
  userId: string;
  /** Analysis run id, used as the LangGraph thread_id. */
  threadId: string;
  /** null resumes the thread from its last checkpoint (retry after a crash). */
  message: string | null;
}

/** One element of an import batch: one imported PDF on its own thread. */
export interface DocumentInvocation {
  userId: string;
  /** The extraction session the document belongs to. */
  runId: string;
  /** Imported file id, used as the LangGraph thread_id. */
  threadId: string;
  /** null resumes the thread from its last checkpoint (retry after a crash). */
  message: string | null;
}

const RECURSION_LIMIT = 500;

type StreamableAgent = Pick<InvoiceAgent, 'stream'>;

/**
 * Runs the deep agents and writes a structured log line for every step
 * (reasoning summaries, todos, tool calls, subagent delegations). Nothing is streamed to the user.
 */
@Injectable()
export class AgentRunnerService implements OnModuleInit {
  private readonly logger = new Logger('AgentRun');
  private inboxAgent!: InvoiceAgent;
  private documentAgent!: DocumentExtractorAgent;

  constructor(private readonly factory: InvoiceAgentFactory) {}

  onModuleInit(): void {
    this.inboxAgent = this.factory.create();
    this.documentAgent = this.factory.createDocumentExtractor();
  }

  /** Inbox analysis (triage + extraction subagents) on the run's thread. Returns the coordinator's summary. */
  run(invocation: AgentInvocation, signal?: AbortSignal): Promise<string> {
    return this.execute(this.inboxAgent, TRIAGE_AGENT_NAME, invocation, { runId: invocation.threadId }, signal);
  }

  /**
   * A batch of document extractions: every element extracts one imported PDF on its own thread, at
   * most `maxConcurrency` at a time. One element failing never stops the others; each result carries
   * the extractor's final answer or its error, in input order.
   */
  extractDocuments(invocations: DocumentInvocation[], maxConcurrency: number): Promise<Array<PromiseSettledResult<string>>> {
    return settleWithConcurrency(invocations, maxConcurrency, (invocation) =>
      this.execute(this.documentAgent as unknown as StreamableAgent, DOCUMENT_EXTRACTOR_AGENT_NAME, invocation, {
        runId: invocation.runId,
      }),
    );
  }

  private async execute(
    agent: StreamableAgent,
    agentName: RootAgentName,
    invocation: AgentInvocation,
    scope: { runId: string },
    signal?: AbortSignal,
  ): Promise<string> {
    const { userId, threadId } = invocation;
    const input = invocation.message === null ? null : { messages: [new HumanMessage(invocation.message)] };
    const startedAt = Date.now();
    const logContext = { runId: scope.runId, threadId, userId };
    this.logger.log({ ...logContext, agent: agentName, event: 'run.started', resumed: invocation.message === null });

    const stream = await agent.stream(input as never, {
      configurable: { thread_id: threadId, user_id: userId, run_id: scope.runId },
      context: { userId },
      streamMode: ['updates', 'custom'],
      subgraphs: true,
      recursionLimit: RECURSION_LIMIT,
      signal,
    });

    let finalAnswer = '';
    for await (const chunk of stream as AsyncIterable<[string[], string, unknown]>) {
      const [namespace, mode, data] = chunk;
      for (const event of mapAgentChunk(namespace, mode, data, agentName)) {
        this.logger.log({ ...logContext, ...event });
        if (event.event === 'agent.message' && event.agent === agentName) finalAnswer = event.text;
      }
    }
    this.logger.log({ ...logContext, agent: agentName, event: 'run.finished', durationMs: Date.now() - startedAt });
    return finalAnswer;
  }
}
