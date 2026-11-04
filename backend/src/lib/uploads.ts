import type { FastifyRequest } from 'fastify';
import type { ImageInput } from '../ai/types.js';
import { AppError } from './errors.js';
import { toImageInput } from './images.js';

/**
 * Reads a multipart request (text fields + files) or a JSON body. Files are validated by magic bytes and hashed;
 * the server never stores them (only their sha256).
 */

interface FileKind<T> {
  parse: (data: Buffer) => T | undefined;
  sha: (file: T) => string;
  unsupportedMessage: string;
  tooLargeMessage: (maxMb: number) => string;
  tooManyMessage: (max: number) => string;
}

async function readFieldsAndFiles<T>(
  request: FastifyRequest,
  limits: { maxFiles: number; maxFileBytes: number },
  kind: FileKind<T>,
): Promise<{ fields: Record<string, string>; files: T[] }> {
  if (!request.isMultipart()) {
    const body = request.body;
    const fields: Record<string, string> = {};
    if (typeof body === 'object' && body !== null) {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') fields[key] = value;
        else if (typeof value === 'boolean' || typeof value === 'number') fields[key] = String(value);
      }
    }
    return { fields, files: [] };
  }

  const fields: Record<string, string> = {};
  const files: T[] = [];
  for await (const part of request.parts({ limits: { files: limits.maxFiles, fileSize: limits.maxFileBytes } })) {
    if (part.type === 'file') {
      const data = await part.toBuffer();
      if (part.file.truncated) {
        throw new AppError('PAYLOAD_TOO_LARGE', kind.tooLargeMessage(Math.round(limits.maxFileBytes / 1024 / 1024)));
      }
      const file = kind.parse(data);
      if (!file) throw new AppError('UNSUPPORTED_MEDIA_TYPE', kind.unsupportedMessage);
      if (!files.some((f) => kind.sha(f) === kind.sha(file))) files.push(file);
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }
  if (files.length > limits.maxFiles) {
    throw new AppError('VALIDATION_ERROR', kind.tooManyMessage(limits.maxFiles));
  }
  return { fields, files };
}

const IMAGE_KIND: FileKind<ImageInput> = {
  parse: toImageInput,
  sha: (image) => image.sha256,
  unsupportedMessage: 'Yalnızca JPEG, PNG, WEBP veya HEIC fotoğraf gönderilebilir',
  tooLargeMessage: (mb) => `Fotoğraf çok büyük (en fazla ${mb} MB)`,
  tooManyMessage: (max) => `En fazla ${max} fotoğraf gönderilebilir`,
};

export async function readFieldsAndImages(
  request: FastifyRequest,
  limits: { maxFiles: number; maxFileBytes: number },
): Promise<{ fields: Record<string, string>; images: ImageInput[] }> {
  const { fields, files } = await readFieldsAndFiles(request, limits, IMAGE_KIND);
  return { fields, images: files };
}
