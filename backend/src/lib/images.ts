import { createHash } from 'node:crypto';
import type { ImageInput, ImageMimeType } from '../ai/types.js';

/** Detects image type from magic bytes (never trust the client's content-type) and reads dimensions when cheap. */
export interface SniffedImage {
  mimeType: ImageMimeType;
  width?: number;
  height?: number;
}

function jpegSize(buf: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return undefined;
    const marker = buf[offset + 1] ?? 0;
    const length = buf.readUInt16BE(offset + 2);
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

export function sniffImage(buf: Buffer): SniffedImage | undefined {
  if (buf.length < 12) return undefined;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const size = jpegSize(buf);
    return { mimeType: 'image/jpeg', ...(size ?? {}) };
  }
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buf.length >= 30) {
      return { mimeType: 'image/webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    return { mimeType: 'image/webp' };
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return { mimeType: 'image/heic' };
    if (['mif1', 'msf1', 'heif'].includes(brand)) return { mimeType: 'image/heif' };
  }
  return undefined;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function toImageInput(data: Buffer): ImageInput | undefined {
  const sniffed = sniffImage(data);
  if (!sniffed) return undefined;
  return { data, sha256: sha256Hex(data), ...sniffed };
}
