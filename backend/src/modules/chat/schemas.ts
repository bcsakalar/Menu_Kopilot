import { z } from 'zod';
import { analyzeResultSchema, type AnalyzeEvent } from '../analyze/schemas.js';

export const messageDtoSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  imageCount: z.number().int(),
  runId: z.uuid().nullable(),
  quickReplies: z.array(z.string()),
  createdAt: z.string(),
  /** The analysis this answer shows, cards included. */
  result: analyzeResultSchema.nullable(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

export const conversationDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: z.string(),
});
export type ConversationDto = z.infer<typeof conversationDtoSchema>;

export const conversationDetailSchema = conversationDtoSchema.extend({ messages: z.array(messageDtoSchema) });
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const messageFieldsSchema = z.object({
  conversationId: z.uuid().optional(),
  text: z.string().trim().max(4000).default(''),
});

/** The analysis events of the run, plus what the conversation adds around them. */
export type ChatEvent =
  | AnalyzeEvent
  | { type: 'conversation'; conversation: ConversationDto }
  | { type: 'user_message'; message: MessageDto }
  | { type: 'message'; message: MessageDto };
