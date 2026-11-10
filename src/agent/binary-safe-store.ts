import { BaseStore, type Item, type Operation, type OperationResults } from '@langchain/langgraph';

type SearchItem = Awaited<ReturnType<BaseStore['search']>>[number];

const BINARY_MARKER = '__finsift_base64__';

type StoreValue = Record<string, unknown>;

/**
 * deepagents' StoreBackend writes binary files as `{ content: Uint8Array }`, which does not survive
 * JSON (jsonb) serialization in PostgresStore. This wrapper base64-encodes binary `content` on write
 * and restores the Uint8Array on read, so PDFs and images stored in the agent's Postgres filesystem
 * come back byte-for-byte and `read_file` can return proper image blocks.
 */
export class BinarySafeStore extends BaseStore {
  constructor(private readonly inner: BaseStore) {
    super();
  }

  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const encoded = operations.map((operation) =>
      'value' in operation && operation.value ? { ...operation, value: encodeValue(operation.value) } : operation,
    ) as Op;
    const results = await this.inner.batch(encoded);
    return results.map((result) => decodeResult(result)) as OperationResults<Op>;
  }

  async get(namespace: string[], key: string): Promise<Item | null> {
    return decodeItem(await this.inner.get(namespace, key));
  }

  async put(namespace: string[], key: string, value: StoreValue, index?: false | string[]): Promise<void> {
    await this.inner.put(namespace, key, encodeValue(value), index);
  }

  async delete(namespace: string[], key: string): Promise<void> {
    await this.inner.delete(namespace, key);
  }

  async search(namespacePrefix: string[], options?: Parameters<BaseStore['search']>[1]): Promise<SearchItem[]> {
    const items = await this.inner.search(namespacePrefix, options);
    return items.map((item) => decodeItem(item) as SearchItem);
  }

  listNamespaces(options?: Parameters<BaseStore['listNamespaces']>[0]): Promise<string[][]> {
    return this.inner.listNamespaces(options);
  }

  start(): void | Promise<void> {
    return this.inner.start();
  }

  stop(): void | Promise<void> {
    return this.inner.stop();
  }
}

function encodeValue(value: StoreValue): StoreValue {
  const content = value.content;
  if (!(content instanceof Uint8Array)) return value;
  return { ...value, content: { [BINARY_MARKER]: Buffer.from(content).toString('base64') } };
}

function decodeValue(value: StoreValue): StoreValue {
  const content = value.content as Record<string, unknown> | undefined;
  if (!content || typeof content !== 'object' || typeof content[BINARY_MARKER] !== 'string') return value;
  return { ...value, content: new Uint8Array(Buffer.from(content[BINARY_MARKER], 'base64')) };
}

function decodeItem<T extends Item | null>(item: T): T {
  if (!item) return item;
  return { ...item, value: decodeValue(item.value) };
}

function decodeResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result.map((entry) => (isItem(entry) ? decodeItem(entry) : entry));
  }
  return isItem(result) ? decodeItem(result) : result;
}

function isItem(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && 'value' in value && 'key' in value && 'namespace' in value;
}
