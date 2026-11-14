import { fold } from '../text/turkish';

/**
 * The image tool's geometry (D-218): the panel's formats, the crop that fills a frame and the fit that shows a whole logo.
 * The drawing and the compression happen in the browser's canvas.
 */

export interface ImagePreset {
  key: 'urun' | 'logo' | 'banner';
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

/** "Logo Final (1).PNG" as a logo JPEG → "logo-final-1-logo-500x500.jpg". */
export function outputName(original: string, preset: ImagePreset, format: 'jpeg' | 'png'): string {
  const base =
    fold(original.replace(/\.[^.]+$/u, ''))
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'gorsel';
  return `${base}-${preset.key}-${preset.width}x${preset.height}.${format === 'jpeg' ? 'jpg' : 'png'}`;
}
