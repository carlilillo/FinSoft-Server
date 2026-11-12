import { AIMessage, HumanMessage, ToolMessage } from 'langchain';
import { describe, expect, it, vi } from 'vitest';
import { cachedImageConverter, type ImageConverter, withNativeFileResults } from './native-file-results.middleware.js';

const PDF_PATH = '/inbox/01JABCDEFGHJKMNPQRSTVWXYZ0/attachments/FV-2026-118.pdf';
const HEIC_PATH = '/uploads/IMG_0042.heic';

function conversation(toolContent: ToolMessage['content'], path = PDF_PATH) {
  return [
    new HumanMessage('Extract the invoice'),
    new AIMessage({
      content: '',
      tool_calls: [{ id: 'call_1', name: 'read_file', args: { file_path: path } }],
    }),
    new ToolMessage({
      content: toolContent,
      tool_call_id: 'call_1',
      name: 'read_file',
    }),
  ];
}

const jpegPages = (count: number): ImageConverter =>
  vi.fn(async () =>
    Array.from({ length: count }, (_, page) => ({
      mimeType: 'image/jpeg' as const,
      data: Buffer.from([page]),
    })),
  );

const unusedConverter: ImageConverter = () => Promise.reject(new Error('should not convert'));

describe('withNativeFileResults', () => {
  it('turns a PDF read by read_file into a native input_file named after the file', async () => {
    const messages = conversation([{ type: 'file', mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' }]);

    const result = await withNativeFileResults(messages, unusedConverter);

    expect(result).not.toBe(messages);
    expect(result[2]).toBeInstanceOf(ToolMessage);
    expect((result[2] as ToolMessage).tool_call_id).toBe('call_1');
    expect(result[2]?.content).toEqual([
      {
        type: 'input_file',
        filename: 'FV-2026-118.pdf',
        file_data: 'data:application/pdf;base64,JVBERi0xLjQ=',
      },
    ]);
  });

  it('leaves text and natively readable images (JPEG, PNG, WebP) untouched', async () => {
    const text = conversation('1\t# Email');
    const png = conversation([{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' }]);
    const jpeg = conversation([{ type: 'image', mimeType: 'image/jpeg', data: '/9j/4AAQ' }]);

    expect(await withNativeFileResults(text, unusedConverter)).toBe(text);
    expect(await withNativeFileResults(png, unusedConverter)).toBe(png);
    expect(await withNativeFileResults(jpeg, unusedConverter)).toBe(jpeg);
  });

  it('shows an image the model cannot read (HEIC, TIFF…) as converted JPEG pages', async () => {
    const convert = jpegPages(2);
    const messages = conversation([{ type: 'image', mimeType: 'image/heic', data: 'AAAAGGZ0eXBoZWlj' }], HEIC_PATH);

    const result = await withNativeFileResults(messages, convert);

    expect(convert).toHaveBeenCalledWith('image/heic', expect.any(Uint8Array));
    expect(result[2]?.content).toEqual([
      {
        type: 'input_text',
        text: 'IMG_0042.heic (image/heic), shown as 2 pages:',
      },
      {
        type: 'input_image',
        image_url: 'data:image/jpeg;base64,AA==',
        detail: 'high',
      },
      {
        type: 'input_image',
        image_url: 'data:image/jpeg;base64,AQ==',
        detail: 'high',
      },
    ]);
  });

  it('tells the model when an image cannot be opened instead of failing the run', async () => {
    const broken: ImageConverter = () => Promise.reject(new Error('corrupt header'));
    const messages = conversation([{ type: 'image', mimeType: 'image/tiff', data: 'SUkqAA==' }], '/uploads/scan.tiff');

    const result = await withNativeFileResults(messages, broken);

    expect(result[2]?.content).toEqual([
      {
        type: 'input_text',
        text: 'Error: scan.tiff (image/tiff) could not be opened as an image: corrupt header',
      },
    ]);
  });

  it('does not mutate the original messages', async () => {
    const messages = conversation([{ type: 'file', mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' }]);
    const before = structuredClone(messages[2]?.content);

    await withNativeFileResults(messages, unusedConverter);

    expect(messages[2]?.content).toEqual(before);
  });
});

describe('cachedImageConverter', () => {
  it('converts the same image once and retries after a failure', async () => {
    const convert = vi
      .fn<ImageConverter>()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValue([{ mimeType: 'image/jpeg', data: Buffer.from([1]) }]);
    const cached = cachedImageConverter(convert);
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(cached('image/heic', bytes)).rejects.toThrow('busy');
    await cached('image/heic', bytes);
    await cached('image/heic', bytes);

    expect(convert).toHaveBeenCalledTimes(2);
  });
});
