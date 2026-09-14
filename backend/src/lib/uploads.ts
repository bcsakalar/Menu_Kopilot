import type { FastifyRequest } from 'fastify';
import type { ImageInput } from '../ai/types.js';
import { AppError } from './errors.js';
import { toImageInput } from './images.js';

/**
 * Reads a multipart request (text fields + image files) or a JSON body. Images are validated by magic bytes and
 * hashed; the server never stores them (only their sha256).
 */
export async function readFieldsAndImages(
  request: FastifyRequest,
  limits: { maxFiles: number; maxFileBytes: number },
): Promise<{ fields: Record<string, string>; images: ImageInput[] }> {
  if (!request.isMultipart()) {
    const body = request.body;
    const fields: Record<string, string> = {};
    if (typeof body === 'object' && body !== null) {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') fields[key] = value;
        else if (typeof value === 'boolean' || typeof value === 'number') fields[key] = String(value);
      }
    }
    return { fields, images: [] };
  }

  const fields: Record<string, string> = {};
  const images: ImageInput[] = [];
  for await (const part of request.parts({ limits: { files: limits.maxFiles, fileSize: limits.maxFileBytes } })) {
    if (part.type === 'file') {
      const data = await part.toBuffer();
      if (part.file.truncated) {
        throw new AppError('PAYLOAD_TOO_LARGE', `Fotoğraf çok büyük (en fazla ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB)`);
      }
      const image = toImageInput(data);
      if (!image) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Yalnızca JPEG, PNG, WEBP veya HEIC fotoğraf gönderilebilir');
      if (!images.some((i) => i.sha256 === image.sha256)) images.push(image);
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }
  if (images.length > limits.maxFiles) {
    throw new AppError('VALIDATION_ERROR', `En fazla ${limits.maxFiles} fotoğraf gönderilebilir`);
  }
  return { fields, images };
}
