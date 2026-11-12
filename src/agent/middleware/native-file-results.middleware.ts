import { createHash } from 'node:crypto';
import { AIMessage, type BaseMessage, createMiddleware, ToolMessage } from 'langchain';
import { MODEL_READABLE_IMAGE_TYPES, type ModelImage, toModelReadableImages } from '../files/model-images.js';

/** Items of an OpenAI Responses `function_call_output` list, passed through by @langchain/openai untouched. */
type NativeToolOutputItem =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' | 'high' }
  | { type: 'input_file'; filename: string; file_data: string };

interface DataBlock {
  type: string;
  text?: string;
  data?: string | Uint8Array;
  mimeType?: string;
  mime_type?: string;
}

/** Turns an image the model cannot read natively into pages it can (see `toModelReadableImages`). */
export type ImageConverter = (mimeType: string, bytes: Uint8Array) => Promise<ModelImage[]>;

/**
 * `read_file` returns a PDF as a standard `file` content block and an image as an `image` block, but
 * @langchain/openai only converts images in tool results into native inputs (and only formats OpenAI
 * reads): a PDF would reach the model as a JSON string of base64, a HEIC photo or a TIFF scan would be
 * rejected. This rewrites those tool results into native `input_file` / `input_image` items, converting
 * images in other formats into JPEG pages, so the model reads every invoice document itself.
 * Only the model request changes; the messages kept in the checkpointed state (and the original files)
 * stay as they are.
 */
export function nativeFileResultsMiddleware(convert: ImageConverter = cachedImageConverter(toModelReadableImages)) {
  return createMiddleware({
    name: 'NativeFileResultsMiddleware',
    wrapModelCall: async (request, handler) => {
      const messages = await withNativeFileResults(request.messages, convert);
      return handler(messages === request.messages ? request : { ...request, messages });
    },
  });
}

/** Returns the same array when no tool result needs rewriting, so unchanged requests stay untouched. */
export async function withNativeFileResults(messages: BaseMessage[], convert: ImageConverter): Promise<BaseMessage[]> {
  let fileNames: Map<string, string> | undefined;
  let changed = false;

  const result = await Promise.all(
    messages.map(async (message) => {
      if (!ToolMessage.isInstance(message) || !Array.isArray(message.content)) return message;
      const blocks = message.contentBlocks as DataBlock[];
      if (!blocks.some(needsRewrite)) return message;

      fileNames ??= requestedFileNames(messages);
      changed = true;
      const fileName = fileNames.get(message.tool_call_id) ?? null;
      const items = (await Promise.all(blocks.map((block) => toNativeItems(block, fileName, convert)))).flat();
      return new ToolMessage({
        content: items as unknown as ToolMessage['content'],
        tool_call_id: message.tool_call_id,
        name: message.name,
        id: message.id,
        artifact: message.artifact,
        status: message.status,
        metadata: message.metadata,
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata,
      });
    }),
  );

  return changed ? result : messages;
}

/** Remembers recent conversions by content: the whole history is sent again on every model call. */
export function cachedImageConverter(convert: ImageConverter, maxEntries = 32): ImageConverter {
  const cache = new Map<string, Promise<ModelImage[]>>();
  return (mimeType, bytes) => {
    const key = `${mimeType}:${createHash('sha256').update(bytes).digest('hex')}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const pending = convert(mimeType, bytes);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
    return pending;
  };
}

function needsRewrite(block: DataBlock): boolean {
  if (block.data === undefined) return false;
  if (block.type === 'file') return true;
  return block.type === 'image' && !MODEL_READABLE_IMAGE_TYPES.has(mimeTypeOf(block));
}

async function toNativeItems(
  block: DataBlock,
  fileName: string | null,
  convert: ImageConverter,
): Promise<NativeToolOutputItem[]> {
  const mimeType = mimeTypeOf(block);
  if (block.type === 'file' && block.data !== undefined) {
    return [
      {
        type: 'input_file',
        filename: fileName ?? 'document.pdf',
        file_data: dataUrl(mimeType, block.data),
      },
    ];
  }
  if (block.type === 'image' && block.data !== undefined) {
    if (MODEL_READABLE_IMAGE_TYPES.has(mimeType)) {
      return [
        {
          type: 'input_image',
          image_url: dataUrl(mimeType, block.data),
          detail: 'auto',
        },
      ];
    }
    return convertedImageItems(block.data, mimeType, fileName ?? 'image', convert);
  }
  if (block.type === 'text' && typeof block.text === 'string') return [{ type: 'input_text', text: block.text }];
  return [{ type: 'input_text', text: JSON.stringify(block) }];
}

async function convertedImageItems(
  data: string | Uint8Array,
  mimeType: string,
  fileName: string,
  convert: ImageConverter,
): Promise<NativeToolOutputItem[]> {
  try {
    const pages = await convert(mimeType, toBytes(data));
    const pageCount = pages.length === 1 ? 'one page' : `${pages.length} pages`;
    return [
      {
        type: 'input_text',
        text: `${fileName} (${mimeType}), shown as ${pageCount}:`,
      },
      ...pages.map((page) => ({
        type: 'input_image' as const,
        image_url: dataUrl(page.mimeType, page.data),
        detail: 'high' as const,
      })),
    ];
  } catch (error) {
    return [
      {
        type: 'input_text',
        text: `Error: ${fileName} (${mimeType}) could not be opened as an image: ${(error as Error).message}`,
      },
    ];
  }
}

function mimeTypeOf(block: DataBlock): string {
  return (block.mimeType ?? block.mime_type ?? 'application/octet-stream').toLowerCase();
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? Buffer.from(data, 'base64') : data;
}

function dataUrl(mimeType: string, data: string | Uint8Array): string {
  const base64 = typeof data === 'string' ? data : Buffer.from(data).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/** Maps each read_file tool call id to the base name of the file it opened (OpenAI requires a filename). */
function requestedFileNames(messages: BaseMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (!AIMessage.isInstance(message)) continue;
    for (const call of message.tool_calls ?? []) {
      const path: unknown = call.args?.file_path;
      if (call.id && typeof path === 'string') names.set(call.id, path.split('/').pop() || 'document.pdf');
    }
  }
  return names;
}
