import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { cuisineDecision, recommendDecision, runChatAgent, type ChatContext } from '../../agents/chat.js';
import { topUp, type RunFocus } from '../../agents/plan.js';
import type { ChatDecision } from '../../agents/schemas/chat.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter } from '../../ai/router.js';
import type { ImageInput } from '../../ai/types.js';
import type { Database } from '../../db/client.js';
import type { MergedItem } from '../../agents/dedupe.js';
import { chatMessages, conversations, cuisines, menuCategories, menuItems, suggestionItems, suggestionRuns } from '../../db/schema/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { AnalyzeFields, AnalyzeResult } from '../analyze/schemas.js';
import { parseMenuText, type AnalyzeService } from '../analyze/service.js';
import type { AnalyzeStore } from '../analyze/store.js';
import type { ChatEvent, ConversationDetail, ConversationDto, MessageDto } from './schemas.js';
import { aiBusy, aiTrouble, ASK_MENU, followUp, fromCuisine, MORE_PRODUCTS, nextSteps, openingGaps, summarize } from './summary.js';

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
/** Gemini's "high demand" and Groq's per-minute token cap both clear within seconds: one more read after this. */
const BUSY_RETRY_MS = 5000;

/** Words of a sentence, never of a product name: "merhaba, yeni bir restoranla görüşüyorum" is no two-item menu. */
const SENTENCE_WORDS = new Set(
  'merhaba selam selamlar günaydın iyi kolay gelsin teşekkürler sağol tamam lütfen bir bu şu ben biz siz için ne nasıl neden mı mi mu mü var yok değil ama gibi şimdi'.split(' '),
);
const isSentence = (name: string) => name.toLocaleLowerCase('tr').split(/\s+/u).some((word) => SENTENCE_WORDS.has(word));

/**
 * Words of a request, never of a product (normalized): "hamsi ile ilgili yemekler öner" names one product, hamsi. Also the
 * category words: "tatlı" alone is a request for desserts, not a product called Tatlı.
 */
const REQUEST_WORDS = new Set(
  (
    'ile ilgili icin gibi olan olarak oner onerir oneri onerisi sun ver getir yaz ekle istiyorum istiyor lazim yemek cesit ' +
    'urun mutfak mutfagi restoran salon menu tur turu turleri liste opsiyon malzeme fazla daha baska yeni tatli corba ' +
    'icecek salata meze ana sicak ara yan kampanya kahvalti hepsi tum butun neler hangi'
  ).split(' '),
);
/** A product name typed alone has at most this many words; a longer line is a sentence for the chat agent. */
const PRODUCT_NAME_WORDS = 4;
/** Product words looked up in one cuisine start: a request names one or two products, never a dozen. */
const MAX_SEEDS = 4;

/** The words of a text that could name a product: normalized, three letters or more, no request words. */
const productWords = (text: string): string[] =>
  [...new Set(normalizeTr(text).split(' ').filter((word) => /^[a-z0-9]{3,}$/u.test(word) && !REQUEST_WORDS.has(word)))];

/** Products a follow-up still owes the menu (D-213): what passes the target, less what this call already offered. */
function owed(last: AnalyzeResult, offered: readonly string[]): number {
  if (!last.counts) return 0;
  const onMenu = new Set(last.menu.map((m) => normalizeTr(m.name)));
  const open = new Set(offered.map(normalizeTr).filter((name) => !onMenu.has(name))).size;
  return topUp(last.counts.current, last.counts.target, open);
}

/** "adana, urfa, ayran": a list of products, which needs no model to understand. Anything else goes to the chat agent. */
export function looksLikeProductList(text: string): boolean {
  const names = parseMenuText(text);
  return (
    names.length >= LIST_MIN_NAMES &&
    !text.includes('?') &&
    names.every((n) => n.length <= LIST_MAX_NAME_CHARS && !isSentence(n))
  );
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
    // A start from the cuisine alone has no product list to carry on: the cuisine is the thread.
    ...(last.menu.length > 0 ? { fromRunId: last.runId } : {}),
    ...(last.counts ? { cuisineId: last.counts.cuisineId } : {}),
    ...(typed.length > 0 ? { menuText: typed.join('\n') } : {}),
    ...(notes ? { notes } : {}),
  });
}

function focusOf(decision: ChatDecision): Partial<RunFocus> {
  if (decision.action === 'recommend') return { products: Math.max(1, decision.productCount), categoryKey: decision.categoryKey };
  if (decision.action === 'complete') return { targets: decision.targets };
  // update_menu: what was just learned gets its cards, and a little of what goes with it, but not what just left the menu.
  return { targets: decision.addProducts, products: decision.addProducts.length > 0 ? PRODUCTS_WITH_NEW_ITEMS : 0, exclude: decision.removeProducts };
}

/**
 * A product joins the menu only if the rep named it: asked to drop the ayran, the model once added a made-up "Yeni
 * İçecek" in its place. A word of the name must start a word of the message ("lahmacunu da ekle" names Lahmacun).
 */
function named(products: readonly string[], text: string): string[] {
  const said = normalizeTr(text).split(' ');
  return products.filter((p) => normalizeTr(p).split(' ').some((word) => word.length >= 3 && said.some((s) => s.startsWith(word))));
}

function onlyNamed(decision: ChatDecision, text: string): ChatDecision {
  return decision.action === 'update_menu' ? { ...decision, addProducts: named(decision.addProducts, text) } : decision;
}

/** One of the buttons of `nextSteps`, typed or clicked. */
function shortcut(text: string, last: AnalyzeResult | null): ChatDecision | undefined {
  if (!last) return undefined;
  const wanted = normalizeTr(text);
  if (wanted === normalizeTr(MORE_PRODUCTS)) return recommendDecision(null);
  const category = last.counts?.categories.find((c) => wanted === normalizeTr(`${c.label} öner`));
  return category ? recommendDecision(category.key) : undefined;
}

function titleOf(conversation: ConversationRow, text: string, result: AnalyzeResult | null): string {
  if (result?.counts) return `${result.counts.cuisineName} · ${result.counts.current} ürün`;
  if (conversation.title !== NEW_TITLE) return conversation.title;
  return text.slice(0, TITLE_CHARS) || NEW_TITLE;
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
      const snapshot = conversation.lastRunId ? await this.deps.store.snapshot(userId, conversation.lastRunId) : null;
      // The conversation's run: a menu, or a cuisine named before any menu (a run that read nothing never becomes it).
      const last = snapshot?.counts ? snapshot : null;
      const typedMenu = !last?.menu.length && (looksLikeProductList(text) || (await this.isProductName(text)));
      if (images.length > 0 || typedMenu) await this.analyzeMenu(userId, outgoing, last, emit);
      else await this.follow(userId, outgoing, last, emit);
    } catch (err) {
      // Every analysis slot taken and the queue full (D-214): a moment later it will go through.
      if (err instanceof AppError && err.code === 'SERVICE_UNAVAILABLE') {
        await this.reply(outgoing, { text: 'Şu an çok yoğunuz. Bir dakika sonra tekrar gönderir misin?', quickReplies: [] }, null, emit);
        return;
      }
      this.deps.onError(err);
      await this.reply(outgoing, { text: 'Bu mesajda bir şeyler ters gitti. Tekrar dener misin?', quickReplies: [] }, null, emit);
    }
  }

  /** A screenshot or a typed list: the first analysis of the menu, or what a later screenshot adds to it. */
  private async analyzeMenu(userId: string, outgoing: OutgoingMessage, last: AnalyzeResult | null, emit: Emit): Promise<void> {
    const { text, images, conversation } = outgoing;
    if (!last?.menu.length) {
      const fields = images.length > 0 ? { ...(text ? { notes: text } : {}) } : { menuText: text };
      // A cuisine the rep named before the menu keeps leading.
      const cuisine = last?.counts ? { cuisineId: last.counts.cuisineId } : {};
      let result = await this.runAgents(userId, outgoing, firstFields({ ...fields, ...cuisine }), {}, emit);
      if (result.menu.length === 0 && images.length > 0 && aiTrouble(result)) {
        await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
        result = await this.runAgents(userId, outgoing, firstFields({ ...fields, ...cuisine }), {}, emit);
      }
      if (result.menu.length > 0) {
        await this.reply(outgoing, summarize(result), result, emit);
        return;
      }
      // An invoice or a blurry shot recommended into the air: no cards, and the conversation keeps its earlier run.
      await this.deps.db.update(conversations).set({ lastRunId: conversation.lastRunId }).where(eq(conversations.id, conversation.id));
      await this.reply(outgoing, summarize(result), null, emit);
      return;
    }
    // What the screenshot adds may still leave the menu short of its target: the call keeps its promise (D-213).
    const products = Math.max(PRODUCTS_WITH_IMAGES, owed(last, await this.offeredNames(conversation.id)));
    const focus = await this.focus(conversation.id, last, { products, newItemsOnly: true });
    const fields = continueFields(last, [], text);
    const result = await this.runAgents(userId, outgoing, fields, { focus }, emit);
    const current = result.counts?.current ?? 0;
    const added = current - (last.counts?.current ?? 0);
    const lead = added > 0 ? `Menüye ${added} ürün daha ekledim, şu an ${current} ürün var.` : 'Bu görüntüde yeni ürün yok, menü aynı kaldı.';
    await this.reply(outgoing, { text: followUp(result, lead), quickReplies: [MORE_PRODUCTS] }, result, emit);
  }

  private async follow(userId: string, outgoing: OutgoingMessage, last: AnalyzeResult | null, emit: Emit): Promise<void> {
    const conversationId = outgoing.conversation.id;
    const quick = shortcut(outgoing.text, last);
    // Before any menu, a message that only names a cuisine and asks for it ("Tantuni için öneri sun", "Uzak Doğu") needs
    // no model: on production the model answered "Tantuni için öneri sun" by asking for a screenshot (D-217).
    const asked = !quick && !last?.menu.length ? await this.cuisineRequest(outgoing.text) : undefined;
    const agent = quick ?? (asked ? cuisineDecision(asked) : await runChatAgent(this.deps, await this.context(outgoing, last), userId));
    // No model could read it (busy, or the day's quota spent): "Uzak Doğu için öneri sun" before any menu needs none (D-216).
    const fallback = 'unanswered' in agent && !last?.menu.length ? (await this.cuisineIn(outgoing.text))?.slug : undefined;
    const decision = onlyNamed(fallback ? { ...agent, action: 'change_cuisine', cuisineSlug: fallback, reply: '' } : agent, outgoing.text);
    const answer = { text: decision.reply, quickReplies: decision.quickReplies };

    if (decision.action === 'answer') {
      await this.reply(outgoing, answer, null, emit);
      return;
    }
    // Products named before any menu start it: "lahmacun da var", "Adana için opsiyon yaz" — a first analysis that fills
    // to the target (D-213), in the cuisine the rep named before, if any.
    const typed = decision.action === 'complete' && !last?.menu.length ? named(decision.targets, outgoing.text) : decision.addProducts;
    if (!last?.menu.length && typed.length > 0) {
      const cuisine = last?.counts ? { cuisineId: last.counts.cuisineId } : {};
      const result = await this.runAgents(userId, outgoing, firstFields({ menuText: typed.join('\n'), ...cuisine }), {}, emit);
      await this.reply(outgoing, summarize(result), result, emit);
      return;
    }
    // A cuisine named with no menu ("Uzak Doğu için öneri sun") or a switch of cuisine: a fresh start from it. The
    // products the request names lead what it suggests: "hamsi ile ilgili yemekler öner" (D-213).
    const cuisineId = (!last || decision.action === 'change_cuisine') && decision.cuisineSlug ? await this.cuisineId(decision.cuisineSlug) : undefined;
    if (cuisineId) {
      const fresh = !last?.menu.length;
      const seeds = fresh ? await this.seedsOf(outgoing.text, cuisineId) : [];
      const notes = seeds.length > 0 ? { notes: outgoing.text } : {};
      const fields = last ? { ...continueFields(last, [], ''), cuisineId, ...notes } : firstFields({ cuisineId, ...notes });
      const result = await this.runAgents(userId, outgoing, fields, { seeds }, emit);
      await this.reply(outgoing, result.menu.length > 0 ? summarize(result) : fromCuisine(result), result, emit);
      return;
    }
    // Nothing to act on: say what would move the call on, never a bare "Bakıyorum.".
    if (!last || decision.action === 'change_cuisine') {
      await this.reply(outgoing, { text: ASK_MENU, quickReplies: [] }, null, emit);
      return;
    }
    const want = focusOf(decision);
    // "Daha fazla ürün öner" after a short answer brings the menu past its target first (D-213); "Tatlı öner" stays one category.
    if (decision.action === 'recommend' && decision.categoryKey === null) {
      want.products = Math.max(want.products ?? 0, owed(last, await this.offeredNames(conversationId)));
    }
    const focus = await this.focus(conversationId, last, want);
    const fields = continueFields(last, typed, decision.note);
    const result = await this.runAgents(userId, outgoing, fields, { focus, remove: decision.removeProducts }, emit);
    const lead = decision.action === 'update_menu' ? `Menüyü güncelledim, şu an ${result.counts?.current ?? 0} ürün var.` : '';
    const quickReplies = aiBusy(result) ? [outgoing.text] : quick ? nextSteps(result) : answer.quickReplies;
    await this.reply(outgoing, { quickReplies, text: followUp(result, lead) }, result, emit);
  }

  private async focus(conversationId: string, last: AnalyzeResult, want: Partial<RunFocus>): Promise<RunFocus> {
    return {
      products: 0,
      categoryKey: null,
      targets: [],
      newItemsOnly: false,
      priceSegment: last.classification?.priceSegment ?? 'orta',
      ...want,
      exclude: [...(await this.offeredNames(conversationId)), ...(await this.removedNames(conversationId, last)), ...(want.exclude ?? [])],
    };
  }

  /** What an earlier run of the call read but the menu no longer holds: the rep took it off ("ayran yokmuş"). */
  private async removedNames(conversationId: string, last: AnalyzeResult): Promise<string[]> {
    const rows = await this.deps.db
      .select({ snapshot: suggestionRuns.menuSnapshot })
      .from(suggestionRuns)
      .innerJoin(chatMessages, eq(chatMessages.runId, suggestionRuns.id))
      .where(eq(chatMessages.conversationId, conversationId));
    const onMenu = new Set(last.menu.map((m) => normalizeTr(m.name)));
    const read = rows.flatMap((row) => (row.snapshot as { extracted?: MergedItem[] } | null)?.extracted ?? []);
    return [...new Set(read.filter((item) => !onMenu.has(item.normalized)).map((item) => item.name))];
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
    const offered = await this.offeredNames(conversationId);
    const categoryRows = await db.select({ key: menuCategories.key, label: menuCategories.label }).from(menuCategories);
    const cuisineRows = await db.select({ slug: cuisines.slug, name: cuisines.name }).from(cuisines);
    const gaps = last?.counts?.categories.filter((c) => c.missing > 0) ?? [];
    return {
      cuisine: last?.counts?.cuisineName ?? 'bilinmiyor',
      segment: last?.classification?.priceSegment ?? 'bilinmiyor',
      counts: last?.counts ? `${last.counts.current} / hedef ${last.counts.target}` : 'menü henüz yok',
      gaps: gaps.map((g) => `${g.label} ${g.present}/${g.minItems}`).join(', ') || '-',
      rules: openingGaps(last?.counts?.quality).join(', ') || '-',
      menu: last?.menu.slice(0, MENU_NAMES).map((m) => m.name).join(', ') || 'menü henüz yok',
      offered: offered.slice(0, OFFERED_NAMES).join(', ') || '-',
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

  private async offeredNames(conversationId: string): Promise<string[]> {
    const rows = await this.deps.db
      .select({ name: suggestionItems.rawName })
      .from(suggestionItems)
      .innerJoin(chatMessages, eq(chatMessages.runId, suggestionItems.runId))
      .where(and(eq(chatMessages.conversationId, conversationId), eq(suggestionItems.section, 'new_product')));
    return rows.map((row) => row.name);
  }

  /**
   * "Lahmacun" or "hamsi" alone: a name the pool knows — the whole name, or every word of it in the pool's products — is
   * the restaurant's product (its cuisine follows), not a cuisine to start from. A cuisine's own name ("Pizza", "Kebap")
   * stays a cuisine: the chat agent starts from it.
   */
  private async isProductName(text: string): Promise<boolean> {
    const names = parseMenuText(text);
    const name = names[0];
    if (names.length !== 1 || !name || text.includes('?') || isSentence(name)) return false;
    const normalized = normalizeTr(name);
    if (normalized.split(' ').length > PRODUCT_NAME_WORDS || (await this.isCuisineName(normalized))) return false;
    const [row] = await this.deps.db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.approved, true), eq(menuItems.normalizedName, normalized)))
      .limit(1);
    if (row) return true;
    const words = productWords(name);
    // Every word of the name must be a product word: "Kebap salonuyuz" is a sentence about a kebap shop.
    if (words.length === 0 || words.length !== normalized.split(' ').length) return false;
    return (await this.poolWords(words)).length === words.length;
  }

  /**
   * The cuisine a message names, read without a model: a cuisine whose name, or one part of it ("Pide" of
   * "Pide & Lahmacun"), stands as whole words in the message; the longest such part wins.
   */
  private async cuisineIn(text: string): Promise<{ slug: string; part: string; words: Set<string> } | undefined> {
    const said = ` ${normalizeTr(text)} `;
    const rows = await this.deps.db.select({ slug: cuisines.slug, name: cuisines.name }).from(cuisines);
    let best: { slug: string; part: string; words: Set<string> } | undefined;
    for (const row of rows) {
      const parts = [normalizeTr(row.name), ...row.name.split('&').map((part) => normalizeTr(part)), row.slug.replace(/-/gu, ' ')];
      for (const part of parts) {
        if (part.length < 3 || !said.includes(` ${part} `)) continue;
        if (!best || part.length > best.part.length) best = { slug: row.slug, part, words: new Set(parts.flatMap((p) => p.split(' '))) };
      }
    }
    return best;
  }

  /**
   * A message that is nothing but a request for a cuisine: every word is the cuisine's own or a request word ("için",
   * "öneri", "sun", "mutfağı"). The cuisine word itself must not be a request word too: "tatlı" or "çorba" alone may
   * mean the dessert or soup category, and the model decides those.
   */
  private async cuisineRequest(text: string): Promise<string | undefined> {
    const found = await this.cuisineIn(text);
    if (!found || found.part.split(' ').every((word) => REQUEST_WORDS.has(word))) return undefined;
    const words = normalizeTr(text).split(' ').filter((word) => word.length > 0);
    return words.every((word) => found.words.has(word) || REQUEST_WORDS.has(word)) ? found.slug : undefined;
  }

  private async isCuisineName(normalized: string): Promise<boolean> {
    const rows = await this.deps.db.select({ slug: cuisines.slug, name: cuisines.name }).from(cuisines);
    return rows.some((c) => normalizeTr(c.name) === normalized || c.slug.replace(/-/gu, ' ') === normalized);
  }

  /** The words a product of the pool starts a word with: "hamsi" (Hamsi Tava, Hamsili Pilav), not "salonuyuz". */
  private async poolWords(words: readonly string[]): Promise<string[]> {
    const found: string[] = [];
    for (const word of words) {
      const [row] = await this.deps.db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(and(eq(menuItems.approved, true), sql`(' ' || ${menuItems.normalizedName}) like ${`% ${word}%`}`))
        .limit(1);
      if (row) found.push(word);
    }
    return found;
  }

  /**
   * D-213. The products a cuisine start's request names, to lead its suggestions: "hamsi ile ilgili yemekler öner" →
   * hamsi. The cuisine's own name says nothing new ("Kebap salonuyuz" is the Kebap cuisine, not a kebap seed).
   */
  private async seedsOf(text: string, cuisineId: string): Promise<string[]> {
    const [cuisine] = await this.deps.db.select({ name: cuisines.name, slug: cuisines.slug }).from(cuisines).where(eq(cuisines.id, cuisineId));
    const own = new Set([...normalizeTr(cuisine?.name ?? '').split(' '), ...(cuisine?.slug ?? '').split('-')]);
    const words = productWords(text).filter((word) => !own.has(word) && !isSentence(word));
    return this.poolWords(words.slice(0, MAX_SEEDS));
  }

  private async cuisineId(slug: string | null): Promise<string | undefined> {
    if (!slug) return undefined;
    const [row] = await this.deps.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, slug));
    return row?.id;
  }
}
