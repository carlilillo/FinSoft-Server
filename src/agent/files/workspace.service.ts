import { Injectable } from '@nestjs/common';
import { type FileData, StoreBackend } from 'deepagents';
import { AgentPersistenceService } from '../agent-persistence.service.js';
import { areaOf, toStoreKey, type WorkspaceArea, workspaceNamespace } from './workspace-paths.js';

export interface WorkspaceFile {
  content: string | Uint8Array;
  mimeType: string;
}

/**
 * Reads and writes the agent's `/inbox/` and `/uploads/` workspace from outside the graph (ingestion,
 * imports and tools). It targets exactly the same PostgresStore namespaces the agents' CompositeBackend routes use.
 */
@Injectable()
export class AgentWorkspaceService {
  constructor(private readonly persistence: AgentPersistenceService) {}

  async writeFiles(userId: string, threadId: string, files: Array<[path: string, content: Uint8Array | string]>): Promise<void> {
    const byArea = new Map<WorkspaceArea, typeof files>();
    for (const file of files) byArea.set(areaOf(file[0]), [...(byArea.get(areaOf(file[0])) ?? []), file]);
    for (const [area, areaFiles] of byArea) {
      const responses = await this.backendFor(area, userId, threadId).uploadFiles(
        areaFiles.map(([path, content]) => [toStoreKey(path), typeof content === 'string' ? new TextEncoder().encode(content) : content]),
      );
      const failed = responses.filter((response) => response.error);
      if (failed.length > 0) {
        throw new Error(`Could not write workspace files: ${failed.map((response) => response.path).join(', ')}`);
      }
    }
  }

  async readFile(userId: string, threadId: string, path: string): Promise<WorkspaceFile | null> {
    const result = await this.backendFor(areaOf(path), userId, threadId).readRaw(toStoreKey(path));
    if (!result.data) return null;
    return toWorkspaceFile(result.data);
  }

  private backendFor(area: WorkspaceArea, userId: string, threadId: string): StoreBackend {
    return new StoreBackend({ store: this.persistence.store, namespace: workspaceNamespace(area, userId, threadId) });
  }
}

function toWorkspaceFile(data: FileData): WorkspaceFile {
  if (Array.isArray(data.content)) return { content: data.content.join('\n'), mimeType: 'text/plain' };
  return { content: data.content, mimeType: 'mimeType' in data ? data.mimeType : 'text/plain' };
}
