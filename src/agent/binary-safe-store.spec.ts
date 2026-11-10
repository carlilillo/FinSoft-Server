import { InMemoryStore } from '@langchain/langgraph';
import { StoreBackend } from 'deepagents';
import { BinarySafeStore } from './binary-safe-store.js';

/** In-memory store that serializes like Postgres jsonb does, to reproduce the binary problem. */
class JsonRoundTripStore extends InMemoryStore {
  async put(namespace: string[], key: string, value: Record<string, unknown>): Promise<void> {
    await super.put(namespace, key, JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
  }
}

describe('BinarySafeStore', () => {
  it('round-trips binary files written through a deepagents StoreBackend', async () => {
    const store = new BinarySafeStore(new JsonRoundTripStore());
    const backend = new StoreBackend({ store, namespace: ['test'] });
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);

    await backend.uploadFiles([
      ['/E1/attachments/factura.pdf', pdfBytes],
      ['/E1/email.md', new TextEncoder().encode('# Email')],
    ]);

    const pdf = await backend.readRaw('/E1/attachments/factura.pdf');
    expect(pdf.data?.content).toBeInstanceOf(Uint8Array);
    expect(Array.from(pdf.data?.content as Uint8Array)).toEqual(Array.from(pdfBytes));

    const markdown = await backend.readRaw('/E1/email.md');
    expect(markdown.data?.content).toBe('# Email');
  });
});
