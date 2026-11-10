import {
  assertImportable,
  ImportFileNotPdfError,
  ImportFileTooLargeError,
  importFileName,
  type IncomingFile,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_FILES,
  NoFilesToImportError,
  resolveImportOutcome,
  TooManyImportFilesError,
} from './import-file.js';

const pdfBytes = new TextEncoder().encode('%PDF-1.7\n…');

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
    expect(() => assertImportable(Array.from({ length: MAX_IMPORT_FILES + 1 }, () => pdf()))).toThrow(TooManyImportFilesError);
  });

  it('rejects files that are not PDFs, by declared type or by content', () => {
    expect(() => assertImportable([pdf({ mimeType: 'image/png' })])).toThrow(ImportFileNotPdfError);
    expect(() => assertImportable([pdf({ bytes: new TextEncoder().encode('<html>') })])).toThrow(ImportFileNotPdfError);
  });

  it('rejects files that are empty or too large', () => {
    expect(() => assertImportable([pdf({ sizeBytes: 0 })])).toThrow(ImportFileTooLargeError);
    expect(() => assertImportable([pdf({ sizeBytes: MAX_IMPORT_FILE_BYTES + 1 })])).toThrow(ImportFileTooLargeError);
  });
});

describe('importFileName', () => {
  it('keeps a safe, readable name that ends in .pdf', () => {
    expect(importFileName('Factura Nº 12 (oct).PDF')).toBe('Factura_N_12_oct_.pdf');
    expect(importFileName('../../etc/passwd')).toBe('etc_passwd.pdf');
    expect(importFileName('.pdf')).toBe('invoice.pdf');
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
