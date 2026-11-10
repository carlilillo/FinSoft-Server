import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store';
import { AppConfigService } from '../config/app-config.service.js';
import { BinarySafeStore } from './binary-safe-store.js';
import { userNamespacePrefix } from './files/inbox-paths.js';

const LANGGRAPH_SCHEMA = 'langgraph';

/**
 * Owns the agent's durable state in PostgreSQL:
 *  - checkpointer: thread state (messages, todos, scratch files) keyed by thread_id = analysis run id
 *  - store: the per-thread `/inbox/` workspace holding email bodies and attachments
 */
@Injectable()
export class AgentPersistenceService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AgentPersistenceService.name);
  readonly checkpointer: PostgresSaver;
  private readonly postgresStore: PostgresStore;
  readonly store: BinarySafeStore;

  constructor(config: AppConfigService) {
    const url = config.get('POSTGRESQL_URL');
    this.checkpointer = PostgresSaver.fromConnString(url, { schema: LANGGRAPH_SCHEMA });
    this.postgresStore = PostgresStore.fromConnString(url, { schema: LANGGRAPH_SCHEMA });
    this.store = new BinarySafeStore(this.postgresStore);
  }

  async onModuleInit(): Promise<void> {
    await this.checkpointer.setup();
    await this.postgresStore.setup();
    this.logger.log(`LangGraph checkpointer and store ready (schema "${LANGGRAPH_SCHEMA}")`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.checkpointer.end(), this.postgresStore.stop()]);
  }

  async hasCheckpoint(threadId: string): Promise<boolean> {
    const tuple = await this.checkpointer.getTuple({ configurable: { thread_id: threadId } });
    return tuple !== undefined;
  }

  /** Deletes checkpoints and every workspace file of the given threads. */
  async purgeThreads(userId: string, threadIds: string[]): Promise<void> {
    for (const threadId of threadIds) await this.checkpointer.deleteThread(threadId);

    const namespaces = await this.store.listNamespaces({ prefix: userNamespacePrefix(userId) });
    for (const namespace of namespaces) {
      let items = await this.store.search(namespace, { limit: 100 });
      while (items.length > 0) {
        await Promise.all(items.map((item) => this.store.delete(item.namespace, item.key)));
        items = await this.store.search(namespace, { limit: 100 });
      }
    }
  }
}
