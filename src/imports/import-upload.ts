import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_FILES, type IncomingFile } from './domain/import-file.js';

/** Multipart field that carries the invoice files, from the computer or from a phone. */
export const IMPORT_FILES_FIELD = 'files';

/** In-memory multer limits shared by every route that receives invoice files. */
export const IMPORT_UPLOAD_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: MAX_IMPORT_FILES },
  defParamCharset: 'utf8',
};

/** The part of a multer memory-storage file the import needs. */
export interface UploadedInvoiceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export function toIncomingFiles(files: UploadedInvoiceFile[] | undefined): IncomingFile[] {
  return (files ?? []).map((file) => ({
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
  }));
}
