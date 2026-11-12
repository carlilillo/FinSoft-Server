/**
 * File formats an invoice can arrive in: a PDF, or an image (a phone photo, a scan or a screenshot).
 * Formats are recognised from the bytes themselves, never from the file name or the declared type:
 * phones and mail clients often send "application/octet-stream" or a wrong extension.
 */

export type InvoiceFileKind = 'pdf' | 'image';

export interface InvoiceFileFormat {
  kind: InvoiceFileKind;
  mimeType: string;
  /** Canonical extension, with the dot. The agent workspace and downloads rely on it. */
  extension: string;
}

const pdf: InvoiceFileFormat = {
  kind: 'pdf',
  mimeType: 'application/pdf',
  extension: '.pdf',
};
const image = (mimeType: string, extension: string): InvoiceFileFormat => ({
  kind: 'image',
  mimeType,
  extension,
});

export const INVOICE_FILE_FORMATS = {
  pdf,
  jpeg: image('image/jpeg', '.jpg'),
  png: image('image/png', '.png'),
  webp: image('image/webp', '.webp'),
  gif: image('image/gif', '.gif'),
  heic: image('image/heic', '.heic'),
  heif: image('image/heif', '.heif'),
  avif: image('image/avif', '.avif'),
  tiff: image('image/tiff', '.tiff'),
  bmp: image('image/bmp', '.bmp'),
} as const satisfies Record<string, InvoiceFileFormat>;

/** Human list of what can be imported, for error messages. */
export const SUPPORTED_INVOICE_FORMATS = 'PDF, JPEG, PNG, WebP, GIF, HEIC/HEIF, AVIF, TIFF or BMP';

/** Every MIME type of a supported invoice image. */
export const INVOICE_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(
  Object.values(INVOICE_FILE_FORMATS)
    .filter((format) => format.kind === 'image')
    .map((format) => format.mimeType),
);

export function invoiceFormatByMimeType(mimeType: string): InvoiceFileFormat | null {
  return Object.values(INVOICE_FILE_FORMATS).find((format) => format.mimeType === mimeType) ?? null;
}

/** The invoice format of a file from its leading bytes (its "magic number"), or null when it is none of them. */
export function detectInvoiceFileFormat(bytes: Uint8Array): InvoiceFileFormat | null {
  const formats = INVOICE_FILE_FORMATS;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return formats.pdf; // "%PDF-"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return formats.jpeg;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return formats.png;
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return formats.gif;
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return formats.webp;
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return formats.tiff;
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length > 26) return formats.bmp;
  if (ascii(bytes, 4, 8) === 'ftyp') return isoMediaFormat(bytes);
  return null;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

/** HEIC, HEIF and AVIF share the ISO media container: the "ftyp" box's brands tell them apart. */
function isoMediaFormat(bytes: Uint8Array): InvoiceFileFormat | null {
  const boxSize = ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
  const brands = [ascii(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= Math.min(boxSize, bytes.length, 256); offset += 4) {
    brands.push(ascii(bytes, offset, offset + 4));
  }
  const [major] = brands;
  if (major && AVIF_BRANDS.has(major)) return INVOICE_FILE_FORMATS.avif;
  if (major && HEIC_BRANDS.has(major)) return INVOICE_FILE_FORMATS.heic;
  if (!major || !HEIF_BRANDS.has(major)) return null;
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return INVOICE_FILE_FORMATS.avif;
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return INVOICE_FILE_FORMATS.heic;
  return INVOICE_FILE_FORMATS.heif;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  if (bytes.length < end) return '';
  return String.fromCharCode(...bytes.subarray(start, end));
}
