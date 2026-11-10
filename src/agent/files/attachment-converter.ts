import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { convert as htmlToText } from 'html-to-text';

/** Below this many characters per page a PDF is treated as scanned and rendered to images instead. */
const MIN_TEXT_CHARS_PER_PAGE = 40;
const MAX_RENDERED_PAGES = 4;
const MAX_TEXT_CHARS = 60_000;

export type ConversionOutput =
  | { kind: 'text'; fileName: string; text: string }
  | { kind: 'images'; files: Array<{ fileName: string; content: Uint8Array }> }
  | { kind: 'unsupported'; reason: string };

/**
 * Turns an attachment into something the model can read through `read_file`:
 * text for digital PDFs, XML, HTML and plain text; PNG page renders for scanned PDFs.
 * Images need no conversion (read_file returns them as image blocks).
 */
export async function convertAttachment(fileName: string, mimeType: string, content: Uint8Array): Promise<ConversionOutput> {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const type = mimeType.toLowerCase();

  if (type === 'application/pdf') return convertPdf(baseName, content);
  if (type.includes('xml')) return { kind: 'text', fileName: `${baseName}.xml.md`, text: clamp(prettyXml(decode(content))) };
  if (type === 'text/html') {
    return { kind: 'text', fileName: `${baseName}.html.md`, text: clamp(htmlToText(decode(content), { wordwrap: false })) };
  }
  if (type.startsWith('text/')) return { kind: 'text', fileName: `${baseName}.txt.md`, text: clamp(decode(content)) };
  if (type.startsWith('image/')) {
    return { kind: 'unsupported', reason: 'Images need no conversion: open the original path with read_file.' };
  }
  return { kind: 'unsupported', reason: `Files of type ${mimeType} cannot be read.` };
}

async function convertPdf(baseName: string, content: Uint8Array): Promise<ConversionOutput> {
  const pdf = await getDocumentProxy(new Uint8Array(content));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const meaningfulChars = text.join('').replace(/\s+/g, '').length;

  if (meaningfulChars >= MIN_TEXT_CHARS_PER_PAGE * Math.max(1, Math.min(totalPages, 2))) {
    const pages = text.map((pageText, index) => `## Page ${index + 1}\n\n${pageText.trim()}`).join('\n\n');
    return { kind: 'text', fileName: `${baseName}.pdf.md`, text: clamp(`# ${baseName}.pdf (${totalPages} pages)\n\n${pages}`) };
  }

  const files: Array<{ fileName: string; content: Uint8Array }> = [];
  for (let page = 1; page <= Math.min(totalPages, MAX_RENDERED_PAGES); page++) {
    const image = await renderPageAsImage(pdf, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: 2,
    });
    files.push({ fileName: `${baseName}-page-${page}.png`, content: new Uint8Array(image) });
  }
  return { kind: 'images', files };
}

function decode(content: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(content);
}

function prettyXml(xml: string): string {
  return xml.replace(/>\s*</g, '>\n<');
}

function clamp(text: string): string {
  return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[truncated]` : text;
}
