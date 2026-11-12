import { z } from 'zod';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES } from '../../db/schema/feedback.js';

export const feedbackKindSchema = z.enum(FEEDBACK_KINDS);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

export const createFeedbackSchema = z.object({
  kind: feedbackKindSchema,
  message: z.string().trim().min(3, 'Birkaç kelime yaz').max(2000),
  name: z.string().trim().max(60).default(''),
  /** The call on screen, when the rep chose to attach it. */
  conversationId: z.uuid().nullable().default(null),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const feedbackDtoSchema = z.object({
  id: z.uuid(),
  kind: feedbackKindSchema,
  message: z.string(),
  authorName: z.string(),
  status: feedbackStatusSchema,
  adminNote: z.string(),
  conversationId: z.uuid().nullable(),
  conversationTitle: z.string().nullable(),
  /** Tells visitors apart without knowing them (the first characters of the visitor id). */
  visitor: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FeedbackDto = z.infer<typeof feedbackDtoSchema>;

export const feedbackListQuerySchema = z.object({
  status: feedbackStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.iso.datetime({ offset: true }).optional(),
});

export const feedbackListSchema = z.object({
  data: z.array(feedbackDtoSchema),
  counts: z.object({ new: z.number().int(), seen: z.number().int(), done: z.number().int() }),
  nextBefore: z.string().nullable(),
});

export const updateFeedbackSchema = z
  .object({ status: feedbackStatusSchema.optional(), adminNote: z.string().trim().max(1000).optional() })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, { message: 'Değişecek bir alan yok' });
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
