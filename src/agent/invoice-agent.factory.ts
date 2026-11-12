import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { CompositeBackend, createDeepAgent, StateBackend, StoreBackend, type SubAgent } from 'deepagents';
import { todoListMiddleware } from 'langchain';
import { z } from 'zod';
import { AppConfigService } from '../config/app-config.service.js';
import { AgentPersistenceService } from './agent-persistence.service.js';
import { INBOX_ROUTE, UPLOADS_ROUTE, type WorkspaceArea, workspaceNamespace } from './files/workspace-paths.js';
import { nativeFileResultsMiddleware } from './middleware/native-file-results.middleware.js';
import {
  DOCUMENT_EXTRACTOR_AGENT_NAME,
  DOCUMENT_EXTRACTOR_SYSTEM_PROMPT,
} from './prompts/document-extractor.prompt.js';
import { EXTRACTOR_AGENT_NAME, EXTRACTOR_DESCRIPTION, EXTRACTOR_SYSTEM_PROMPT } from './prompts/extractor.prompt.js';
import { TRIAGE_AGENT_NAME, TRIAGE_SYSTEM_PROMPT } from './prompts/triage.prompt.js';
import { AgentToolsFactory } from './tools/agent-tools.factory.js';

export const agentContextSchema = z.object({ userId: z.string() });

/** The inbox and uploads hold the user's original documents: the model reads them but never changes them. */
const WORKSPACE_PERMISSIONS = [
  {
    operations: ['write' as const],
    paths: ['/inbox/**', '/uploads/**'],
    mode: 'deny' as const,
  },
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
      backend: () => this.createBackend(INBOX_ROUTE, 'inbox'),
      permissions: WORKSPACE_PERMISSIONS,
    });
  }

  /**
   * Extracts ONE imported document (PDF or image) per thread: no inbox, no triage, no subagent. Its thread id is the
   * imported file id and `run_id` (configurable) is the extraction session it belongs to.
   */
  createDocumentExtractor() {
    return createDeepAgent({
      name: DOCUMENT_EXTRACTOR_AGENT_NAME,
      model: this.createModel(),
      systemPrompt: DOCUMENT_EXTRACTOR_SYSTEM_PROMPT,
      tools: this.tools.documentExtractorTools(),
      middleware: [todoListMiddleware(), nativeFileResultsMiddleware()],
      contextSchema: agentContextSchema,
      checkpointer: this.persistence.checkpointer,
      store: this.persistence.store,
      backend: () => this.createBackend(UPLOADS_ROUTE, 'uploads'),
      permissions: WORKSPACE_PERMISSIONS,
    });
  }

  /**
   * Scratch files and todos live in thread state (persisted by the Postgres checkpointer); the
   * documents route (`/inbox/` or `/uploads/`) goes to the Postgres store, namespaced by user and
   * thread (no cross-thread memory).
   */
  private createBackend(route: string, area: WorkspaceArea): CompositeBackend {
    return new CompositeBackend(new StateBackend(), {
      [route]: new StoreBackend({
        store: this.persistence.store,
        namespace: ({ config }) => {
          const configurable = config?.configurable ?? {};
          return workspaceNamespace(area, String(configurable.user_id), String(configurable.thread_id));
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
export type DocumentExtractorAgent = ReturnType<InvoiceAgentFactory['createDocumentExtractor']>;
