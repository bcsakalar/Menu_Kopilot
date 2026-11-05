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
  menu: string;
  offered: string;
  categories: string;
  cuisines: string;
  history: string;
  message: string;
}

export const AI_BUSY = 'Yapay zekâ servisleri şu an çok yoğun. Birkaç saniye sonra tekrar dene.';
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

/** What the next-step buttons ask for needs no model: they work, and at once, when the providers are overloaded. */
export const recommendDecision = (categoryKey: string | null): ChatDecision => ({ ...NOTHING, targets: [], addProducts: [], removeProducts: [], quickReplies: [], action: 'recommend', reply: '', categoryKey, productCount: 5 });

const noAi = (message: string): ChatDecision => ({
  ...NOTHING,
  targets: [],
  addProducts: [],
  removeProducts: [],
  action: 'answer',
  reply: AI_BUSY,
  quickReplies: message.length <= NO_RETRY_CHARS ? [message] : [],
});

export async function runChatAgent(
  deps: { router: AiRouter; prompts: PromptRepository },
  context: ChatContext,
  userId: string,
): Promise<ChatDecision> {
  const system = (await deps.prompts.render('agent.chat.system')).text;
  const user = (await deps.prompts.render('agent.chat.user', { ...context })).text;
  const { result } = await generateChecked(
    deps,
    { task: 'agent.chat', schema: chatDecisionSchema, schemaName: CHAT_SCHEMA_NAME, system, user },
    { userId, budget: new RequestBudget(CHAT_LLM_CALLS, CHAT_INPUT_TOKENS) },
  );
  return result.ok ? result.value : noAi(context.message);
}
