import { and, asc, desc, eq } from 'drizzle-orm';
import { runChatAgent, type ChatContext } from '../../agents/chat.js';
import type { RunFocus } from '../../agents/plan.js';
import type { ChatDecision } from '../../agents/schemas/chat.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter } from '../../ai/router.js';
import type { ImageInput } from '../../ai/types.js';
import type { Database } from '../../db/client.js';
import { chatMessages, conversations, cuisines, menuCategories, suggestionItems } from '../../db/schema/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import type { AnalyzeFields, AnalyzeResult } from '../analyze/schemas.js';
import { parseMenuText, type AnalyzeService } from '../analyze/service.js';
import type { AnalyzeStore } from '../analyze/store.js';
import type { ChatEvent, ConversationDetail, ConversationDto, MessageDto } from './schemas.js';
import { followUp, summarize } from './summary.js';

const NEW_TITLE = 'Yeni görüşme';
const TITLE_CHARS = 48;
const HISTORY_MESSAGES = 8;
const HISTORY_CHARS = 400;
const MENU_NAMES = 80;
const OFFERED_NAMES = 40;
const LIST_MIN_NAMES = 2;
const LIST_MAX_NAME_CHARS = 60;
/** A later screenshot brings a few new products with it, on top of the cards for what it added. */
const PRODUCTS_WITH_IMAGES = 4;
const PRODUCTS_WITH_NEW_ITEMS = 3;
const MORE_PRODUCTS = 'Daha fazla ürün öner';

/** "adana, urfa, ayran": a list of products, which needs no model to understand. */
export function looksLikeProductList(text: string): boolean {
  const names = parseMenuText(text);
  return names.length >= LIST_MIN_NAMES && !text.includes('?') && names.every((n) => n.length <= LIST_MAX_NAME_CHARS);
}

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof chatMessages.$inferSelect;
type Emit = (event: ChatEvent) => void;

const toConversation = (row: ConversationRow): ConversationDto => ({
  id: row.id,
  title: row.title,
  updatedAt: row.updatedAt.toISOString(),
});

const toMessage = (row: MessageRow, result: AnalyzeResult | null): MessageDto => ({
  id: row.id,
  role: row.role,
  text: row.text,
  imageCount: row.imageCount,
  runId: row.runId,
  quickReplies: row.quickReplies,
  createdAt: row.createdAt.toISOString(),
  result,
});

export interface OutgoingMessage {
  conversation: ConversationRow;
  message: MessageRow;
  text: string;
  images: ImageInput[];
}

/** The first analysis on a call is the quick one: it must arrive during the call, and more is one message away. */
const firstFields = (fields: Partial<AnalyzeFields>): AnalyzeFields => ({ mode: 'quick', debug: false, ...fields });

function continueFields(last: AnalyzeResult, typed: readonly string[], notes: string): AnalyzeFields {
  return firstFields({
    fromRunId: last.runId,
    ...(last.counts ? { cuisineId: last.counts.cuisineId } : {}),
    ...(typed.length > 0 ? { menuText: typed.join('\n') } : {}),
    ...(notes ? { notes } : {}),
  });
}

function focusOf(decision: ChatDecision): Partial<RunFocus> {
  if (decision.action === 'recommend') return { products: Math.max(1, decision.productCount), categoryKey: decision.categoryKey };
  if (decision.action === 'complete') return { targets: decision.targets };
  // update_menu: what was just learned gets its cards, and a little of what goes with it.
  return { targets: decision.addProducts, products: decision.addProducts.length > 0 ? PRODUCTS_WITH_NEW_ITEMS : 0 };
}

function titleOf(conversation: ConversationRow, text: string, result: AnalyzeResult | null): string {
  if (result?.counts) return `${result.counts.cuisineName} · ${result.counts.current} ürün`;
  if (conversation.title !== NEW_TITLE) return conversation.title;
  return text.slice(0, TITLE_CHARS) || NEW_TITLE;
}

function answerLabel(accepted: boolean | null): string {
  if (accepted === null) return 'cevap bekliyor';
  return accepted ? 'kabul edildi' : 'reddedildi';
}

/** The site's only door: a conversation per restaurant call, each message answered directly or by a run of the agents. */
export class ChatService {
  constructor(
    private readonly deps: {
      db: Database;
      analyze: AnalyzeService;
      store: AnalyzeStore;
      router: AiRouter;
      prompts: PromptRepository;
      onError: (err: unknown) => void;
    },
  ) {}

  async list(userId: string): Promise<ConversationDto[]> {
    const rows = await this.deps.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
    return rows.map(toConversation);
  }

  private async owned(userId: string, id: string): Promise<ConversationRow> {
    const [row] = await this.deps.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    if (!row) throw notFound('Görüşme');
    return row;
  }

  async detail(userId: string, id: string): Promise<ConversationDetail> {
    const row = await this.owned(userId, id);
    const rows = await this.deps.db.select().from(chatMessages).where(eq(chatMessages.conversationId, id)).orderBy(asc(chatMessages.createdAt));
    const messages = await Promise.all(rows.map(async (m) => toMessage(m, m.runId ? await this.deps.store.snapshot(userId, m.runId) : null)));
    return { ...toConversation(row), messages };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.deps.db.delete(conversations).where(eq(conversations.id, id));
  }

  /** Validates and stores the rep's message; anything wrong here is an ordinary error response, before the stream opens. */
  async accept(userId: string, input: { conversationId?: string | undefined; text: string; images: ImageInput[] }): Promise<OutgoingMessage> {
    if (input.text === '' && input.images.length === 0) throw new AppError('VALIDATION_ERROR', 'Bir mesaj yaz veya ekran görüntüsü yapıştır');
    const conversation = input.conversationId ? await this.owned(userId, input.conversationId) : await this.create(userId);
    const [message] = await this.deps.db
      .insert(chatMessages)
      .values({ conversationId: conversation.id, role: 'user', text: input.text, imageCount: input.images.length })
      .returning();
    if (!message) throw new Error('message insert failed');
    return { conversation, message, text: input.text, images: input.images };
  }

  private async create(userId: string): Promise<ConversationRow> {
    const [row] = await this.deps.db.insert(conversations).values({ userId, title: NEW_TITLE }).returning();
    if (!row) throw new Error('conversation insert failed');
    return row;
  }

  /** Answers the message. It finishes even if the browser left: the answer is waiting in the conversation. */
  async answer(userId: string, outgoing: OutgoingMessage, emit: Emit): Promise<void> {
    const { conversation, text, images } = outgoing;
    emit({ type: 'conversation', conversation: toConversation(conversation) });
    emit({ type: 'user_message', message: toMessage(outgoing.message, null) });
    try {
      const last = conversation.lastRunId ? await this.deps.store.snapshot(userId, conversation.lastRunId) : null;
      if (images.length > 0 || (!last && looksLikeProductList(text))) await this.analyzeMenu(userId, outgoing, last, emit);
      else await this.follow(userId, outgoing, last, emit);
    } catch (err) {
      this.deps.onError(err);
      await this.reply(outgoing, { text: 'Bu mesajda bir şeyler ters gitti. Tekrar dener misin?', quickReplies: [] }, null, emit);
    }
  }

  /** A screenshot or a typed list: the first analysis of the menu, or what a later screenshot adds to it. */
  private async analyzeMenu(userId: string, outgoing: OutgoingMessage, last: AnalyzeResult | null, emit: Emit): Promise<void> {
    const { text, images, conversation } = outgoing;
    if (!last) {
      const fields = images.length > 0 ? { ...(text ? { notes: text } : {}) } : { menuText: text };
      const result = await this.runAgents(userId, outgoing, firstFields(fields), {}, emit);
      await this.reply(outgoing, summarize(result), result, emit);
      return;
    }
    const focus = await this.focus(conversation.id, last, { products: PRODUCTS_WITH_IMAGES, newItemsOnly: true });
    const fields = continueFields(last, await this.acceptedNames(conversation.id), text);
    const result = await this.runAgents(userId, outgoing, fields, { focus }, emit);
    const current = result.counts?.current ?? 0;
    const added = current - (last.counts?.current ?? 0);
    const lead = added > 0 ? `Menüye ${added} ürün daha ekledim, şu an ${current} ürün var.` : 'Bu görüntüde yeni ürün yok, menü aynı kaldı.';
    await this.reply(outgoing, { text: followUp(result, lead), quickReplies: [MORE_PRODUCTS] }, result, emit);
  }

  private async follow(userId: string, outgoing: OutgoingMessage, last: AnalyzeResult | null, emit: Emit): Promise<void> {
    const conversationId = outgoing.conversation.id;
    const decision = await runChatAgent(this.deps, await this.context(outgoing, last), userId);
    const answer = { text: decision.reply, quickReplies: decision.quickReplies };

    if (decision.action === 'update_menu' && !last && decision.addProducts.length > 0) {
      const result = await this.runAgents(userId, outgoing, firstFields({ menuText: decision.addProducts.join('\n') }), {}, emit);
      await this.reply(outgoing, summarize(result), result, emit);
      return;
    }
    const cuisineId = decision.action === 'change_cuisine' ? await this.cuisineId(decision.cuisineSlug) : undefined;
    if (!last || decision.action === 'answer' || (decision.action === 'change_cuisine' && !cuisineId)) {
      await this.reply(outgoing, answer, null, emit);
      return;
    }

    const accepted = await this.acceptedNames(conversationId);
    if (cuisineId) {
      const result = await this.runAgents(userId, outgoing, { ...continueFields(last, accepted, ''), cuisineId }, {}, emit);
      await this.reply(outgoing, summarize(result), result, emit);
      return;
    }
    const focus = await this.focus(conversationId, last, focusOf(decision));
    const fields = continueFields(last, [...accepted, ...decision.addProducts], decision.note);
    const result = await this.runAgents(userId, outgoing, fields, { focus, remove: decision.removeProducts }, emit);
    const lead = decision.action === 'update_menu' ? `Menüyü güncelledim, şu an ${result.counts?.current ?? 0} ürün var.` : '';
    await this.reply(outgoing, { ...answer, text: followUp(result, lead) }, result, emit);
  }

  private async focus(conversationId: string, last: AnalyzeResult, want: Partial<RunFocus>): Promise<RunFocus> {
    return {
      products: 0,
      categoryKey: null,
      targets: [],
      newItemsOnly: false,
      exclude: await this.offeredNames(conversationId),
      priceSegment: last.classification?.priceSegment ?? 'orta',
      ...want,
    };
  }

  private async runAgents(
    userId: string,
    outgoing: OutgoingMessage,
    fields: AnalyzeFields,
    chat: Parameters<AnalyzeService['start']>[3],
    emit: Emit,
  ): Promise<AnalyzeResult> {
    const started = await this.deps.analyze.start(userId, fields, outgoing.images, chat);
    const off = this.deps.analyze.subscribe(started.runId, emit);
    await started.done;
    off?.();
    await this.deps.db.update(conversations).set({ lastRunId: started.runId }).where(eq(conversations.id, outgoing.conversation.id));
    return this.deps.analyze.snapshot(userId, started.runId);
  }

  private async reply(outgoing: OutgoingMessage, answer: { text: string; quickReplies: string[] }, result: AnalyzeResult | null, emit: Emit): Promise<void> {
    const { conversation } = outgoing;
    const [message] = await this.deps.db
      .insert(chatMessages)
      .values({ conversationId: conversation.id, role: 'assistant', text: answer.text, runId: result?.runId ?? null, quickReplies: answer.quickReplies })
      .returning();
    if (!message) throw new Error('message insert failed');
    const [updated] = await this.deps.db
      .update(conversations)
      .set({ updatedAt: new Date(), title: titleOf(conversation, outgoing.text, result) })
      .where(eq(conversations.id, conversation.id))
      .returning();
    if (updated) emit({ type: 'conversation', conversation: toConversation(updated) });
    emit({ type: 'message', message: toMessage(message, result) });
  }

  private async context(outgoing: OutgoingMessage, last: AnalyzeResult | null): Promise<ChatContext> {
    const { db } = this.deps;
    const conversationId = outgoing.conversation.id;
    const history = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(HISTORY_MESSAGES + 1);
    const cards = await this.offeredCards(conversationId);
    const categoryRows = await db.select({ key: menuCategories.key, label: menuCategories.label }).from(menuCategories);
    const cuisineRows = await db.select({ slug: cuisines.slug, name: cuisines.name }).from(cuisines);
    const gaps = last?.counts?.categories.filter((c) => c.missing > 0) ?? [];
    return {
      cuisine: last?.counts?.cuisineName ?? 'bilinmiyor',
      segment: last?.classification?.priceSegment ?? 'bilinmiyor',
      counts: last?.counts ? `${last.counts.current} / hedef ${last.counts.target}` : 'menü henüz yok',
      gaps: gaps.map((g) => `${g.label} ${g.present}/${g.minItems}`).join(', ') || '-',
      menu: last?.menu.slice(0, MENU_NAMES).map((m) => m.name).join(', ') || 'menü henüz yok',
      offered: cards.slice(0, OFFERED_NAMES).map((c) => `${c.name} (${answerLabel(c.accepted)})`).join(', ') || '-',
      categories: categoryRows.map((c) => `${c.key} | ${c.label}`).join(', '),
      cuisines: cuisineRows.map((c) => `${c.slug} | ${c.name}`).join(', '),
      history:
        history
          .filter((m) => m.id !== outgoing.message.id)
          .reverse()
          .map((m) => `${m.role === 'user' ? 'Temsilci' : 'Asistan'}: ${m.text.slice(0, HISTORY_CHARS)}`)
          .join('\n') || '-',
      message: outgoing.text,
    };
  }

  private offeredCards(conversationId: string) {
    return this.deps.db
      .select({ name: suggestionItems.rawName, accepted: suggestionItems.accepted })
      .from(suggestionItems)
      .innerJoin(chatMessages, eq(chatMessages.runId, suggestionItems.runId))
      .where(and(eq(chatMessages.conversationId, conversationId), eq(suggestionItems.section, 'new_product')));
  }

  private async offeredNames(conversationId: string): Promise<string[]> {
    return (await this.offeredCards(conversationId)).map((c) => c.name);
  }

  /** What the seller said yes to is on the menu from here on: it counts, and it can be asked about. */
  private async acceptedNames(conversationId: string): Promise<string[]> {
    return (await this.offeredCards(conversationId)).filter((c) => c.accepted === true).map((c) => c.name);
  }

  private async cuisineId(slug: string | null): Promise<string | undefined> {
    if (!slug) return undefined;
    const [row] = await this.deps.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, slug));
    return row?.id;
  }
}
