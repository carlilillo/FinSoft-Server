import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { CompositeBackend, createDeepAgent, StateBackend, StoreBackend, type SubAgent } from 'deepagents';
import { todoListMiddleware } from 'langchain';
import { z } from 'zod';
import { AppConfigService } from '../config/app-config.service.js';
import { AgentPersistenceService } from './agent-persistence.service.js';
import { INBOX_ROUTE, inboxNamespace } from './files/inbox-paths.js';
import { nativeFileResultsMiddleware } from './middleware/native-file-results.middleware.js';
import { EXTRACTOR_AGENT_NAME, EXTRACTOR_DESCRIPTION, EXTRACTOR_SYSTEM_PROMPT } from './prompts/extractor.prompt.js';
import { TRIAGE_AGENT_NAME, TRIAGE_SYSTEM_PROMPT } from './prompts/triage.prompt.js';
import { AgentToolsFactory } from './tools/agent-tools.factory.js';

export const agentContextSchema = z.object({ userId: z.string() });

/** The inbox holds the user's original emails and attachments: the model reads them but never changes them. */
const WORKSPACE_PERMISSIONS = [{ operations: ['write' as const], paths: ['/inbox/**'], mode: 'deny' as const }];

@Injectable()
export class InvoiceAgentFactory {
  constructor(
    private readonly config: AppConfigService,
    private readonly persistence: AgentPersistenceService,
    private readonly tools: AgentToolsFactory,
  ) {}

  create() {
    const extractor: SubAgent = {
      name: EXTRACTOR_AGENT_NAME,
      description: EXTRACTOR_DESCRIPTION,
      systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
      tools: this.tools.extractorTools(),
      middleware: [todoListMiddleware(), nativeFileResultsMiddleware()],
      permissions: WORKSPACE_PERMISSIONS,
    };

    return createDeepAgent({
      name: TRIAGE_AGENT_NAME,
      model: this.createModel(),
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      tools: this.tools.triageTools(),
      subagents: [extractor],
      middleware: [todoListMiddleware(), nativeFileResultsMiddleware()],
      contextSchema: agentContextSchema,
      checkpointer: this.persistence.checkpointer,
      store: this.persistence.store,
      backend: () => this.createBackend(),
      permissions: WORKSPACE_PERMISSIONS,
    });
  }

  /**
   * Scratch files and todos live in thread state (persisted by the Postgres checkpointer);
   * `/inbox/` is routed to the Postgres store, namespaced by user and thread (no cross-thread memory).
   */
  private createBackend(): CompositeBackend {
    return new CompositeBackend(new StateBackend(), {
      [INBOX_ROUTE]: new StoreBackend({
        store: this.persistence.store,
        namespace: ({ config }) => {
          const configurable = config?.configurable ?? {};
          return inboxNamespace(String(configurable.user_id), String(configurable.thread_id));
        },
      }),
    });
  }

  private createModel(): ChatOpenAI {
    return new ChatOpenAI({
      model: this.config.get('OPENAI_MODEL'),
      apiKey: this.config.get('OPENAI_API_KEY'),
      useResponsesApi: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      maxRetries: 3,
    });
  }
}

export type InvoiceAgent = ReturnType<InvoiceAgentFactory['create']>;
