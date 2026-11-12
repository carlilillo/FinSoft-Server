import { InMemoryStore } from '@langchain/langgraph';
import { StoreBackend } from 'deepagents';
import type { AgentPersistenceService } from '../agent-persistence.service.js';
import { BinarySafeStore } from '../binary-safe-store.js';
import { AgentWorkspaceService } from './workspace.service.js';
import { toStoreKey, uploadsNamespace } from './workspace-paths.js';

/** In-memory store that serializes like Postgres jsonb does. */
class JsonRoundTripStore extends InMemoryStore {
  async put(namespace: string[], key: string, value: Record<string, unknown>): Promise<void> {
    await super.put(namespace, key, JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
  }
}

describe('AgentWorkspaceService', () => {
  const store = new BinarySafeStore(new JsonRoundTripStore());
  const workspace = new AgentWorkspaceService({ store } as unknown as AgentPersistenceService);
  /** What the agent's read_file sees for the same thread. */
  const agentView = new StoreBackend({ store, namespace: uploadsNamespace('user_1', 'T1') });

  it('stores images byte for byte with their real type, even in formats deepagents does not know', async () => {
    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff, 0x00, 0x80]);
    await workspace.writeFiles('user_1', 'T1', [{ path: '/uploads/scan.tiff', content: tiff, mimeType: 'image/tiff' }]);

    const read = await agentView.read(toStoreKey('/uploads/scan.tiff'));
    expect(read.mimeType).toBe('image/tiff');
    expect(Array.from(read.content as Uint8Array)).toEqual(Array.from(tiff));

    const original = await workspace.readFile('user_1', 'T1', '/uploads/scan.tiff');
    expect(original?.mimeType).toBe('image/tiff');
    expect(Array.from(original?.content as Uint8Array)).toEqual(Array.from(tiff));
  });

  it('keeps text files as text', async () => {
    await workspace.writeFiles('user_1', 'T1', [
      { path: '/uploads/note.md', content: '# Email', mimeType: 'text/markdown' },
      { path: '/uploads/factura.xml', content: new TextEncoder().encode('<Facturae/>'), mimeType: 'text/xml' },
    ]);

    expect((await agentView.read('/note.md')).content).toContain('# Email');
    expect((await agentView.read('/factura.xml')).content).toContain('<Facturae/>');
  });
});
