import { Injectable } from '@nestjs/common';
import { type FileData, StoreBackend } from 'deepagents';
import { AgentPersistenceService } from '../agent-persistence.service.js';
import { areaOf, toStoreKey, type WorkspaceArea, workspaceNamespace } from './workspace-paths.js';

export interface WorkspaceFile {
  content: string | Uint8Array;
  mimeType: string;
}

export interface WorkspaceFileWrite extends WorkspaceFile {
  path: string;
}

/**
 * Reads and writes the agent's `/inbox/` and `/uploads/` workspace from outside the graph (ingestion,
 * imports and tools). It targets exactly the same PostgresStore namespaces the agents' CompositeBackend routes use.
 */
@Injectable()
export class AgentWorkspaceService {
  constructor(private readonly persistence: AgentPersistenceService) {}

  /**
   * Stores each file with the MIME type it is given. deepagents' own upload guesses the type from the
   * extension and treats unknown ones (.tiff, .bmp, .avif…) as text, which would corrupt the bytes;
   * `read_file` uses the stored type, so an image always comes back to the model as an image.
   */
  async writeFiles(userId: string, threadId: string, files: WorkspaceFileWrite[]): Promise<void> {
    const now = new Date().toISOString();
    for (const file of files) {
      // The value StoreBackend itself stores (deepagents' v2 FileData).
      const value = { content: toStoredContent(file), mimeType: file.mimeType, created_at: now, modified_at: now };
      await this.persistence.store.put(workspaceNamespace(areaOf(file.path), userId, threadId), toStoreKey(file.path), value);
    }
  }

  async readFile(userId: string, threadId: string, path: string): Promise<WorkspaceFile | null> {
    const result = await this.backendFor(areaOf(path), userId, threadId).readRaw(toStoreKey(path));
    if (!result.data) return null;
    return toWorkspaceFile(result.data);
  }

  private backendFor(area: WorkspaceArea, userId: string, threadId: string): StoreBackend {
    return new StoreBackend({
      store: this.persistence.store,
      namespace: workspaceNamespace(area, userId, threadId),
    });
  }
}

/** Same rule as deepagents' `read_file`: text types are kept as strings, everything else as raw bytes. */
export function isWorkspaceTextType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json';
}

function toStoredContent(file: WorkspaceFileWrite): string | Uint8Array {
  if (isWorkspaceTextType(file.mimeType)) {
    return typeof file.content === 'string' ? file.content : new TextDecoder().decode(file.content);
  }
  return typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
}

function toWorkspaceFile(data: FileData): WorkspaceFile {
  if (Array.isArray(data.content)) return { content: data.content.join('\n'), mimeType: 'text/plain' };
  return {
    content: data.content,
    mimeType: 'mimeType' in data ? data.mimeType : 'text/plain',
  };
}
