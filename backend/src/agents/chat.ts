import { RequestBudget } from '../ai/budget.js';
import type { PromptRepository } from '../ai/prompt-repository.js';
import type { AiRouter } from '../ai/router.js';
import { CHAT_SCHEMA_NAME, chatDecisionSchema, type ChatDecision } from './schemas/chat.js';
import { generateChecked } from './validator.js';

/**
 * The chat agent reads one message of the rep and decides: answer it, or run a slice of the analysis agents. It writes
 * no product itself, so a product asked for in chat passes the same kitchen and duplicate guards as a first analysis.
 */

export interface ChatContext {
  cuisine: string;
  segment: string;
  counts: string;
  gaps: string;
  /** The opening rules the menu misses for sure (D-206), or '-'. */
  rules: string;
  menu: string;
  offered: string;
  categories: string;
  cuisines: string;
  history: string;
  message: string;
}

export const AI_BUSY = 'Yapay zekâ servisleri şu an çok yoğun. Birkaç saniye sonra tekrar dene.';
/** The day's model quota is spent: waiting a few seconds will not help, the pool still answers (D-216). */
export const AI_SPENT =
  'Bugünkü yapay zekâ kotası doldu; ekran görüntüleri gece yarısından sonra yeniden okunur. Ürün adlarını virgülle yaz ya da bir mutfak adı ver, şablon havuzundan önereyim.';
const CHAT_LLM_CALLS = 2;
const CHAT_INPUT_TOKENS = 6000;
const NO_RETRY_CHARS = 60;
const NOTHING = {
  categoryKey: null,
  productCount: 0,
  targets: [],
  addProducts: [],
  removeProducts: [],
  cuisineSlug: null,
  note: '',
  quickReplies: [],
} as const;

/** "Tatlı öner" brings a handful of one category; "Daha fazla ürün öner" a round of ten, or what the target still needs (D-213). */
const CATEGORY_ROUND = 5;
const MORE_ROUND = 10;

/** What the next-step buttons ask for needs no model: they work, and at once, when the providers are overloaded. */
export const recommendDecision = (categoryKey: string | null): ChatDecision => ({
  ...NOTHING,
  targets: [],
  addProducts: [],
  removeProducts: [],
  quickReplies: [],
  action: 'recommend',
  reply: '',
  categoryKey,
  productCount: categoryKey ? CATEGORY_ROUND : MORE_ROUND,
});

/** The decision when no model could read the message; `unanswered` lets the chat try what it can do without one. */
export type ChatAnswer = ChatDecision & { unanswered?: true };

const noAi = (message: string, spent: boolean): ChatAnswer => ({
  ...NOTHING,
  targets: [],
  addProducts: [],
  removeProducts: [],
  action: 'answer',
  reply: spent ? AI_SPENT : AI_BUSY,
  quickReplies: !spent && message.length <= NO_RETRY_CHARS ? [message] : [],
  unanswered: true,
});

export async function runChatAgent(
  deps: { router: AiRouter; prompts: PromptRepository },
  context: ChatContext,
  userId: string,
): Promise<ChatAnswer> {
  const system = (await deps.prompts.render('agent.chat.system')).text;
  const user = (await deps.prompts.render('agent.chat.user', { ...context })).text;
  const { result } = await generateChecked(
    deps,
    { task: 'agent.chat', schema: chatDecisionSchema, schemaName: CHAT_SCHEMA_NAME, system, user },
    { userId, budget: new RequestBudget(CHAT_LLM_CALLS, CHAT_INPUT_TOKENS) },
  );
  return result.ok ? result.value : noAi(context.message, result.error.kind === 'quota_exceeded');
}
