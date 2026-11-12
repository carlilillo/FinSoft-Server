import { detectInvoiceFileFormat, INVOICE_FILE_FORMATS } from './document-format.js';

const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(
    parts.flatMap((part) => (typeof part === 'string' ? Array.from(part, (char) => char.charCodeAt(0)) : part)),
  );

/** An ISO media "ftyp" box with its major brand and compatible brands. */
const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + compatible.length * 4;
  return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compatible, [0, 0, 0, 0]);
};

describe('detectInvoiceFileFormat', () => {
  it('recognises PDFs and every supported image format from their bytes', () => {
    expect(detectInvoiceFileFormat(bytes('%PDF-1.7\n'))).toBe(INVOICE_FILE_FORMATS.pdf);
    expect(detectInvoiceFileFormat(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe(INVOICE_FILE_FORMATS.jpeg);
    expect(detectInvoiceFileFormat(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe(INVOICE_FILE_FORMATS.png);
    expect(detectInvoiceFileFormat(bytes('GIF89a', [1, 0]))).toBe(INVOICE_FILE_FORMATS.gif);
    expect(detectInvoiceFileFormat(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe(INVOICE_FILE_FORMATS.webp);
    expect(detectInvoiceFileFormat(bytes('II', [0x2a, 0]))).toBe(INVOICE_FILE_FORMATS.tiff);
    expect(detectInvoiceFileFormat(bytes('MM', [0, 0x2a]))).toBe(INVOICE_FILE_FORMATS.tiff);
    expect(
      detectInvoiceFileFormat(
        bytes(
          'BM',
          Array.from({ length: 40 }, () => 0),
        ),
      ),
    ).toBe(INVOICE_FILE_FORMATS.bmp);
  });

  it('tells HEIC, HEIF and AVIF apart by their brands', () => {
    expect(detectInvoiceFileFormat(ftyp('heic', 'mif1', 'heic'))).toBe(INVOICE_FILE_FORMATS.heic);
    expect(detectInvoiceFileFormat(ftyp('mif1', 'heic'))).toBe(INVOICE_FILE_FORMATS.heic);
    expect(detectInvoiceFileFormat(ftyp('avif', 'mif1'))).toBe(INVOICE_FILE_FORMATS.avif);
    expect(detectInvoiceFileFormat(ftyp('mif1', 'avif'))).toBe(INVOICE_FILE_FORMATS.avif);
    expect(detectInvoiceFileFormat(ftyp('mif1', 'miaf'))).toBe(INVOICE_FILE_FORMATS.heif);
  });

  it('rejects anything else, whatever its name claims', () => {
    expect(detectInvoiceFileFormat(bytes('<html><body>'))).toBeNull();
    expect(detectInvoiceFileFormat(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectInvoiceFileFormat(ftyp('isom', 'mp41'))).toBeNull(); // an MP4 video
    expect(detectInvoiceFileFormat(new Uint8Array())).toBeNull();
  });
});
