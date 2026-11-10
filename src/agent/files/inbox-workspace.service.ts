import { Injectable } from '@nestjs/common';
import { type FileData, StoreBackend } from 'deepagents';
import { AgentPersistenceService } from '../agent-persistence.service.js';
import { inboxNamespace, toStoreKey } from './inbox-paths.js';

export interface WorkspaceFile {
  content: string | Uint8Array;
  mimeType: string;
}

/**
 * Reads and writes the agent's `/inbox/` workspace from outside the graph (ingestion and tools).
 * It targets exactly the same PostgresStore namespace the agent's CompositeBackend route uses.
 */
@Injectable()
export class InboxWorkspaceService {
  constructor(private readonly persistence: AgentPersistenceService) {}

  async writeFiles(userId: string, threadId: string, files: Array<[path: string, content: Uint8Array | string]>): Promise<void> {
    const backend = this.backendFor(userId, threadId);
    const responses = await backend.uploadFiles(
      files.map(([path, content]) => [toStoreKey(path), typeof content === 'string' ? new TextEncoder().encode(content) : content]),
    );
    const failed = responses.filter((response) => response.error);
    if (failed.length > 0) {
      throw new Error(`Could not write workspace files: ${failed.map((response) => response.path).join(', ')}`);
    }
  }

  async readFile(userId: string, threadId: string, path: string): Promise<WorkspaceFile | null> {
    const result = await this.backendFor(userId, threadId).readRaw(toStoreKey(path));
    if (!result.data) return null;
    return toWorkspaceFile(result.data);
  }

  private backendFor(userId: string, threadId: string): StoreBackend {
    return new StoreBackend({ store: this.persistence.store, namespace: inboxNamespace(userId, threadId) });
  }
}

function toWorkspaceFile(data: FileData): WorkspaceFile {
  if (Array.isArray(data.content)) return { content: data.content.join('\n'), mimeType: 'text/plain' };
  return { content: data.content, mimeType: 'mimeType' in data ? data.mimeType : 'text/plain' };
}
