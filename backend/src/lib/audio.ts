import type { AudioInput, AudioMimeType } from '../ai/types.js';
import { sha256Hex } from './images.js';

/**
 * Recognizes the audio containers Whisper accepts (flac, mp3, mp4/m4a, ogg, wav, webm) by magic bytes — the
 * client-declared content type is not trusted. AAC in ADTS framing is rejected (not in Groq's list); phones record
 * AAC inside an m4a container.
 */
const IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif', 'avif', 'avis']);

export function sniffAudio(data: Buffer): { mimeType: AudioMimeType; ext: string } | undefined {
  if (data.length < 12) return undefined;
  const ascii = (start: number, end: number) => data.subarray(start, end).toString('latin1');
  if (ascii(4, 8) === 'ftyp') {
    // Same container family as HEIC/AVIF photos: those brands are images, not audio.
    if (IMAGE_BRANDS.has(ascii(8, 12))) return undefined;
    return { mimeType: 'audio/mp4', ext: 'm4a' };
  }
  if (ascii(0, 4) === 'OggS') return { mimeType: 'audio/ogg', ext: 'ogg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mimeType: 'audio/wav', ext: 'wav' };
  if (ascii(0, 4) === 'fLaC') return { mimeType: 'audio/flac', ext: 'flac' };
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return { mimeType: 'audio/webm', ext: 'webm' };
  if (ascii(0, 3) === 'ID3') return { mimeType: 'audio/mpeg', ext: 'mp3' };
  // MPEG audio frame sync (11 bits) with a layer other than 00 (00 = AAC ADTS).
  const second = data[1] ?? 0;
  if (data[0] === 0xff && (second & 0xe0) === 0xe0 && ((second >> 1) & 0x03) !== 0) return { mimeType: 'audio/mpeg', ext: 'mp3' };
  return undefined;
}

export function toAudioInput(data: Buffer): AudioInput | undefined {
  const kind = sniffAudio(data);
  if (!kind) return undefined;
  const sha256 = sha256Hex(data);
  return { data, mimeType: kind.mimeType, sha256, fileName: `note-${sha256.slice(0, 12)}.${kind.ext}` };
}
