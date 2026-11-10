import { AIMessage, HumanMessage, ToolMessage } from 'langchain';
import { describe, expect, it } from 'vitest';
import { withNativeFileResults } from './native-file-results.middleware.js';

const PATH = '/inbox/01JABCDEFGHJKMNPQRSTVWXYZ0/attachments/FV-2026-118.pdf';

function conversation(toolContent: ToolMessage['content']) {
  return [
    new HumanMessage('Extract the invoice'),
    new AIMessage({ content: '', tool_calls: [{ id: 'call_1', name: 'read_file', args: { file_path: PATH } }] }),
    new ToolMessage({ content: toolContent, tool_call_id: 'call_1', name: 'read_file' }),
  ];
}

describe('withNativeFileResults', () => {
  it('turns a PDF read by read_file into a native input_file named after the file', () => {
    const messages = conversation([{ type: 'file', mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' }]);

    const result = withNativeFileResults(messages);

    expect(result).not.toBe(messages);
    expect(result[2]).toBeInstanceOf(ToolMessage);
    expect((result[2] as ToolMessage).tool_call_id).toBe('call_1');
    expect(result[2]?.content).toEqual([
      { type: 'input_file', filename: 'FV-2026-118.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQ=' },
    ]);
  });

  it('leaves text and image tool results untouched', () => {
    const text = conversation('1\t# Email');
    const image = conversation([{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' }]);

    expect(withNativeFileResults(text)).toBe(text);
    expect(withNativeFileResults(image)).toBe(image);
  });

  it('does not mutate the original messages', () => {
    const messages = conversation([{ type: 'file', mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' }]);
    const before = structuredClone(messages[2]?.content);

    withNativeFileResults(messages);

    expect(messages[2]?.content).toEqual(before);
  });
});
