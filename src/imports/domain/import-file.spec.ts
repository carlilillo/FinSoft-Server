import { INVOICE_FILE_FORMATS } from '../../documents/domain/document-format.js';
import {
  assertImportable,
  ImportFileTooLargeError,
  importFileName,
  type IncomingFile,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_FILES,
  NoFilesToImportError,
  resolveImportOutcome,
  TooManyImportFilesError,
  UnsupportedImportFileError,
} from './import-file.js';

const pdfBytes = new TextEncoder().encode('%PDF-1.7\n…');
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10]);
const heicBytes = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic\0\0\0\0mif1heic')]);

const pdf = (overrides: Partial<IncomingFile> = {}): IncomingFile => ({
  fileName: 'factura.pdf',
  mimeType: 'application/pdf',
  sizeBytes: pdfBytes.byteLength,
  bytes: pdfBytes,
  ...overrides,
});

describe('assertImportable', () => {
  it(`accepts from 1 to ${MAX_IMPORT_FILES} PDFs`, () => {
    expect(() => assertImportable([pdf()])).not.toThrow();
    expect(() => assertImportable(Array.from({ length: MAX_IMPORT_FILES }, () => pdf()))).not.toThrow();
  });

  it('rejects an empty batch and batches over the limit', () => {
    expect(() => assertImportable([])).toThrow(NoFilesToImportError);
    expect(() => assertImportable(Array.from({ length: MAX_IMPORT_FILES + 1 }, () => pdf()))).toThrow(
      TooManyImportFilesError,
    );
  });

  it('accepts images as invoices and reads every format from the content, not the declared type', () => {
    const files = assertImportable([
      pdf(),
      pdf({
        fileName: 'ticket.jpg',
        mimeType: 'image/jpeg',
        bytes: jpegBytes,
        sizeBytes: jpegBytes.byteLength,
      }),
      pdf({
        fileName: 'IMG_0042.HEIC',
        mimeType: '',
        bytes: heicBytes,
        sizeBytes: heicBytes.byteLength,
      }),
      pdf({
        fileName: 'scan',
        mimeType: 'application/octet-stream',
        bytes: jpegBytes,
        sizeBytes: jpegBytes.byteLength,
      }),
    ]);
    expect(files.map((file) => file.format)).toEqual([
      INVOICE_FILE_FORMATS.pdf,
      INVOICE_FILE_FORMATS.jpeg,
      INVOICE_FILE_FORMATS.heic,
      INVOICE_FILE_FORMATS.jpeg,
    ]);
  });

  it('rejects files that are neither a PDF nor a supported image, whatever they claim to be', () => {
    const html = new TextEncoder().encode('<html>');
    expect(() => assertImportable([pdf({ bytes: html })])).toThrow(UnsupportedImportFileError);
    expect(() =>
      assertImportable([
        pdf({
          mimeType: 'image/svg+xml',
          bytes: new TextEncoder().encode('<svg>'),
        }),
      ]),
    ).toThrow(UnsupportedImportFileError);
  });

  it('rejects files that are empty or too large', () => {
    expect(() => assertImportable([pdf({ sizeBytes: 0 })])).toThrow(ImportFileTooLargeError);
    expect(() => assertImportable([pdf({ sizeBytes: MAX_IMPORT_FILE_BYTES + 1 })])).toThrow(ImportFileTooLargeError);
  });
});

describe('importFileName', () => {
  it('keeps a safe, readable name whose extension matches the real format', () => {
    expect(importFileName('Factura Nº 12 (oct).PDF', INVOICE_FILE_FORMATS.pdf)).toBe('Factura_N_12_oct_.pdf');
    expect(importFileName('../../etc/passwd', INVOICE_FILE_FORMATS.pdf)).toBe('etc_passwd.pdf');
    expect(importFileName('.pdf', INVOICE_FILE_FORMATS.pdf)).toBe('invoice.pdf');
    expect(importFileName('IMG_0042.HEIC', INVOICE_FILE_FORMATS.heic)).toBe('IMG_0042.heic');
    expect(importFileName('ticket.jpeg', INVOICE_FILE_FORMATS.png)).toBe('ticket.png');
  });
});

describe('resolveImportOutcome', () => {
  it('counts the document as extracted when invoices were stored', () => {
    expect(resolveImportOutcome('01J… — Acme — 12.00 EUR — 1 lines', 1)).toEqual({ status: 'extracted', reason: null });
  });

  it('reads the extractor verdict when nothing was stored', () => {
    expect(resolveImportOutcome('NOT_AN_INVOICE: It is a quote (presupuesto).', 0)).toEqual({
      status: 'not_invoice',
      reason: 'It is a quote (presupuesto).',
    });
    expect(resolveImportOutcome('FAILED: The scan is unreadable.', 0)).toEqual({
      status: 'failed',
      reason: 'The scan is unreadable.',
    });
  });

  it('treats a silent finish without invoices as a failure', () => {
    expect(resolveImportOutcome('', 0).status).toBe('failed');
  });
});
