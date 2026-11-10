import { AIMessage, type BaseMessage, createMiddleware, ToolMessage } from 'langchain';

/** Items of an OpenAI Responses `function_call_output` list, passed through by @langchain/openai untouched. */
type NativeToolOutputItem =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
  | { type: 'input_file'; filename: string; file_data: string };

interface DataBlock {
  type: string;
  text?: string;
  data?: string | Uint8Array;
  mimeType?: string;
  mime_type?: string;
}

/**
 * `read_file` returns a PDF as a standard `file` content block, but @langchain/openai only converts images in tool
 * results into native inputs: anything else would reach the model as a JSON string of base64. This rewrites those
 * tool results into native `input_file` items so the model reads the PDF itself.
 * Only the model request changes; the messages kept in the checkpointed state stay provider-neutral.
 */
export function nativeFileResultsMiddleware() {
  return createMiddleware({
    name: 'NativeFileResultsMiddleware',
    wrapModelCall: (request, handler) => {
      const messages = withNativeFileResults(request.messages);
      return handler(messages === request.messages ? request : { ...request, messages });
    },
  });
}

/** Returns the same array when no tool result carries a file, so unchanged requests stay untouched. */
export function withNativeFileResults(messages: BaseMessage[]): BaseMessage[] {
  let fileNames: Map<string, string> | undefined;
  let changed = false;

  const result = messages.map((message) => {
    if (!ToolMessage.isInstance(message) || !Array.isArray(message.content)) return message;
    const blocks = message.contentBlocks as DataBlock[];
    if (!blocks.some((block) => block.type === 'file' && block.data !== undefined)) return message;

    fileNames ??= requestedFileNames(messages);
    changed = true;
    const fileName = fileNames.get(message.tool_call_id) ?? 'document.pdf';
    return new ToolMessage({
      content: blocks.map((block) => toNativeItem(block, fileName)) as unknown as ToolMessage['content'],
      tool_call_id: message.tool_call_id,
      name: message.name,
      id: message.id,
      artifact: message.artifact,
      status: message.status,
      metadata: message.metadata,
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
    });
  });

  return changed ? result : messages;
}

function toNativeItem(block: DataBlock, fileName: string): NativeToolOutputItem {
  const mimeType = block.mimeType ?? block.mime_type ?? 'application/octet-stream';
  if (block.type === 'file' && block.data !== undefined) {
    return { type: 'input_file', filename: fileName, file_data: dataUrl(mimeType, block.data) };
  }
  if (block.type === 'image' && block.data !== undefined) {
    return { type: 'input_image', image_url: dataUrl(mimeType, block.data), detail: 'auto' };
  }
  if (block.type === 'text' && typeof block.text === 'string') return { type: 'input_text', text: block.text };
  return { type: 'input_text', text: JSON.stringify(block) };
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
