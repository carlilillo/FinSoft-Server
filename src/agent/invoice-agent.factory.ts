import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { CompositeBackend, createDeepAgent, StateBackend, StoreBackend, type SubAgent } from 'deepagents';
import { todoListMiddleware } from 'langchain';
import { z } from 'zod';
import { AppConfigService } from '../config/app-config.service.js';
import { AgentPersistenceService } from './agent-persistence.service.js';
import { INBOX_ROUTE, inboxNamespace } from './files/inbox-paths.js';
import { EXTRACTOR_AGENT_NAME, EXTRACTOR_DESCRIPTION, EXTRACTOR_SYSTEM_PROMPT } from './prompts/extractor.prompt.js';
import { TRIAGE_AGENT_NAME, TRIAGE_SYSTEM_PROMPT } from './prompts/triage.prompt.js';
import { AgentToolsFactory } from './tools/agent-tools.factory.js';

export const agentContextSchema = z.object({ userId: z.string() });

/** PDFs, XML and HTML must go through convert_attachment; the inbox is read-only for the model. */
const WORKSPACE_PERMISSIONS = [
  { operations: ['read' as const], paths: ['/inbox/**/attachments/*.{pdf,xml,html}'], mode: 'deny' as const },
  { operations: ['write' as const], paths: ['/inbox/**'], mode: 'deny' as const },
];

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
      middleware: [todoListMiddleware()],
      permissions: [{ operations: ['read'], paths: ['/inbox/**/attachments/*.{pdf,xml,html}'], mode: 'deny' }],
    };

    return createDeepAgent({
      name: TRIAGE_AGENT_NAME,
      model: this.createModel(),
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      tools: this.tools.triageTools(),
      subagents: [extractor],
      middleware: [todoListMiddleware()],
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
