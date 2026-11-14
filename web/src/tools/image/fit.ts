import { fold } from '../text/turkish';

/**
 * The image tool's geometry (D-218): the panel's formats, the crop that fills a frame and the fit that shows a whole logo.
 * The drawing and the compression happen in the browser's canvas.
 */

export interface ImagePreset {
  key: 'urun' | 'logo' | 'banner' | 'ozel';
  label: string;
  hint: string;
  width: number;
  height: number;
  maxKb: number;
}

export const IMAGE_PRESETS: readonly ImagePreset[] = [
  { key: 'urun', label: 'Ürün görseli', hint: 'Kare, en fazla 150 KB', width: 1000, height: 1000, maxKb: 150 },
  { key: 'logo', label: 'Mağaza logosu', hint: 'Kare, en fazla 150 KB', width: 500, height: 500, maxKb: 150 },
  { key: 'banner', label: 'Mağaza banner’ı', hint: '1035 × 390, en fazla 150 KB', width: 1035, height: 390, maxKb: 150 },
];

/** A size of one's own (D-219): the given width, height and limit; the frame is never larger than this. */
export function customPreset(width: number, height: number, maxKb: number): ImagePreset {
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(value) || low));
  return { key: 'ozel', label: 'Özel ölçü', hint: '', width: clamp(width, 16, 4000), height: clamp(height, 16, 4000), maxKb: clamp(maxKb, 10, 5000) };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of the source that fills the frame without distortion ("kırp"). `focusX`/`focusY` (0–1) slide it towards an
 * edge; the middle by default.
 */
export function coverRect(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number, focusX = 0.5, focusY = 0.5): Rect {
  const frame = frameWidth / frameHeight;
  const source = sourceWidth / sourceHeight;
  const width = source > frame ? Math.round(sourceHeight * frame) : sourceWidth;
  const height = source > frame ? sourceHeight : Math.round(sourceWidth / frame);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: Math.round((sourceWidth - width) * clamp(focusX)),
    y: Math.round((sourceHeight - height) * clamp(focusY)),
    width,
    height,
  };
}

/** Where the whole source sits inside the frame ("sığdır"): as large as it fits, centred, the rest is background. */
export function containRect(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number): Rect {
  const scale = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return { x: Math.round((frameWidth - width) / 2), y: Math.round((frameHeight - height) / 2), width, height };
}

/** How much the used part of the source is enlarged to fill or fit the frame; above 1 it loses sharpness. */
export function enlargement(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number, fit: 'cover' | 'contain'): number {
  const across = frameWidth / sourceWidth;
  const down = frameHeight / sourceHeight;
  return fit === 'cover' ? Math.max(across, down) : Math.min(across, down);
}

/** Past this a photo visibly softens: worth asking the seller for a larger one (D-220). */
export const SOFT_ENLARGEMENT = 1.25;

/**
 * The part of an image inside its plain margins (D-220): the corners' colour — or transparency — is the background, and
 * the box around everything else is the content. A logo sent with a wide white border fills the frame without it; an
 * image whose corners differ (a photo) comes back whole.
 */
export function contentRect(pixels: Uint8ClampedArray, width: number, height: number, tolerance = 28): Rect {
  const whole = { x: 0, y: 0, width, height };
  if (width === 0 || height === 0) return whole;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const clear = (i: number) => pixels[i + 3]! < 16;
  const base = at(0, 0);
  const near = (i: number) =>
    Math.abs(pixels[i]! - pixels[base]!) <= tolerance && Math.abs(pixels[i + 1]! - pixels[base + 1]!) <= tolerance && Math.abs(pixels[i + 2]! - pixels[base + 2]!) <= tolerance;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const transparent = corners.every(clear);
  if (!transparent && !corners.every((corner) => !clear(corner) && near(corner))) return whole;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = at(x, y);
      if (clear(i) || (!transparent && near(i))) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? whole : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** "Logo Final (1).PNG" as a logo JPEG → "logo-final-1-logo-500x500.jpg". */
export function outputName(original: string, preset: ImagePreset, format: 'jpeg' | 'png'): string {
  const base =
    fold(original.replace(/\.[^.]+$/u, ''))
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'gorsel';
  return `${base}-${preset.key}-${preset.width}x${preset.height}.${format === 'jpeg' ? 'jpg' : 'png'}`;
}
