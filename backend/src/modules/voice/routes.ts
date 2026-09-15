import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors.js';
import { readFieldsAndAudio } from '../../lib/uploads.js';
import { getAuthUser } from '../../plugins/auth.js';
import { transcribeFieldsSchema, transcriptionDtoSchema } from './schemas.js';
import type { VoiceService } from './service.js';

export const voiceRoutes: FastifyPluginAsyncZod<{ service: VoiceService; maxFileBytes: number }> = async (
  app,
  { service, maxFileBytes },
) => {
  app.post(
    '/transcribe',
    {
      schema: {
        tags: ['voice'],
        summary: 'Voice note → text + product names (multipart: audio, language?, cuisineId?)',
        description: 'Groq Whisper. The recording is not stored. m4a / mp3 / ogg / wav / webm / flac.',
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        response: { 200: transcriptionDtoSchema },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const { fields, audio } = await readFieldsAndAudio(request, { maxFileBytes });
      if (!audio) throw new AppError('VALIDATION_ERROR', 'Ses kaydı ekle (alan adı: audio)');
      const parsed = transcribeFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'İstek doğrulanamadı', parsed.error.issues.map((i) => ({ path: i.path, message: i.message })));
      }
      return service.transcribe(user.id, audio, parsed.data);
    },
  );
};
