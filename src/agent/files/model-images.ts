import { createCanvas, loadImage } from '@napi-rs/canvas';
import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';

/** Image types the model reads natively: they reach it untouched. */
export const MODEL_READABLE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Pages of a multi-page TIFF (a scanned or faxed invoice) shown to the model. */
const MAX_PAGES = 20;
/** Longest edge of a converted page: keeps small print legible without sending huge scans. */
const MAX_EDGE_PX = 3072;

export interface ModelImage {
  mimeType: 'image/jpeg';
  data: Buffer;
}

/**
 * Converts an invoice image the model cannot read natively (HEIC/HEIF, AVIF, TIFF, BMP, GIF) into
 * JPEG pages it can. This is only a reading copy for the model: the original file stays in the
 * workspace and is what gets stored as the invoice's document.
 */
export async function toModelReadableImages(mimeType: string, bytes: Uint8Array): Promise<ModelImage[]> {
  switch (mimeType) {
    case 'image/heic':
    case 'image/heif': {
      const { width, height, data } = await decodeHeic({ buffer: bytes });
      return [
        await toJpeg(
          sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
            raw: { width, height, channels: 4 },
          }),
        ),
      ];
    }
    case 'image/bmp': {
      const image = await loadImage(Buffer.from(bytes));
      const canvas = createCanvas(image.width, image.height);
      canvas.getContext('2d').drawImage(image, 0, 0);
      return [await toJpeg(sharp(await canvas.encode('png')))];
    }
    case 'image/tiff': {
      const { pages = 1 } = await sharp(bytes).metadata();
      const count = Math.min(pages, MAX_PAGES);
      return Promise.all(Array.from({ length: count }, (_, page) => toJpeg(sharp(bytes, { page }))));
    }
    default:
      // GIF (first frame), AVIF and anything else sharp decodes.
      return [await toJpeg(sharp(bytes))];
  }
}

async function toJpeg(image: Sharp): Promise<ModelImage> {
  const data = await image
    .rotate() // honour the EXIF orientation of phone photos
    .resize({
      width: MAX_EDGE_PX,
      height: MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { mimeType: 'image/jpeg', data };
}
