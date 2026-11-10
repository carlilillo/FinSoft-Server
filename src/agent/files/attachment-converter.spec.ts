import { englishReceiptPng, spanishInvoicePdf } from '../../scripts/fixtures.js';
import { convertAttachment } from './attachment-converter.js';

describe('convertAttachment', () => {
  it('extracts the text layer of a digital PDF into markdown', async () => {
    const output = await convertAttachment('FV-2026-118.pdf', 'application/pdf', new Uint8Array(spanishInvoicePdf()));
    expect(output.kind).toBe('text');
    if (output.kind !== 'text') return;
    expect(output.fileName).toBe('FV-2026-118.pdf.md');
    expect(output.text).toContain('TOTAL FACTURA: 106,00 EUR');
    expect(output.text).toContain('## Page 1');
  });

  it('turns XML e-invoices into readable text', async () => {
    const xml = '<Invoice><ID>INV-1</ID><Total>12.00</Total></Invoice>';
    const output = await convertAttachment('inv.xml', 'application/xml', new TextEncoder().encode(xml));
    expect(output).toEqual({ kind: 'text', fileName: 'inv.xml.md', text: '<Invoice>\n<ID>INV-1</ID>\n<Total>12.00</Total>\n</Invoice>' });
  });

  it('leaves images for read_file and refuses unknown binaries', async () => {
    expect((await convertAttachment('r.png', 'image/png', new Uint8Array(englishReceiptPng()))).kind).toBe('unsupported');
    expect((await convertAttachment('a.zip', 'application/zip', new Uint8Array([1])))).toEqual({
      kind: 'unsupported',
      reason: 'Files of type application/zip cannot be read.',
    });
  });
});
