import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../../src/db/schema/index.js';
import type { CardDto } from '../../src/modules/analyze/schemas.js';
import type { ConversationDetail } from '../../src/modules/chat/schemas.js';
import { CHAT_LIMITS } from '../../src/modules/chat/routes.js';
import { looksLikeProductList } from '../../src/modules/chat/service.js';
import { FakeProvider, hashEmbedding, okJson, type FakeResponder } from '../helpers/fake-provider.js';
import { fixtureResponder, loadFixtures, multipartBody, parseSse, type Fixtures } from '../helpers/fixtures.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';

/** The site's door: a browser with no account, its cookie, and what a chat message turns into. */

const noDecision = {
  categoryKey: null,
  productCount: 0,
  targets: [],
  addProducts: [],
  removeProducts: [],
  cuisineSlug: null,
  note: '',
  quickReplies: [],
};

let ctx: TestContext;
let fx: Fixtures;
let decision: Record<string, unknown>;
let chatPrompts: string[];
/** Every model refuses to read images, as when Gemini is overloaded and Groq is at its per-minute cap. */
let extractDown = false;

const responder = (fallback: FakeResponder): FakeResponder => (request, call) => {
  if (request.task === 'agent.extract' && extractDown) return { ok: false, kind: 'unavailable', message: 'high demand' };
  if (request.task !== 'agent.chat') return fallback(request, call);
  chatPrompts.push(request.user);
  return okJson(decision);
};

interface Sent {
  status: number;
  cookie: string | undefined;
  events: ReturnType<typeof parseSse>;
}

/** One white pixel: the fake extractor has no recording of it, so it reads no product. */
const NO_MENU = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let lastHost = 0;

/** Each from its own address: the door allows 20 messages a minute per IP, and this file sends more than that. */
async function send(fields: Record<string, string>, cookie?: string, image?: Buffer): Promise<Sent> {
  lastHost += 1;
  const body = multipartBody(fields, image ? [{ name: 'images', filename: 'menu.png', contentType: 'image/png', data: image }] : []);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/chat/messages',
    headers: { ...body.headers, ...(cookie ? { cookie } : {}) },
    payload: body.payload,
    remoteAddress: `10.0.0.${lastHost}`,
  });
  const header = res.headers['set-cookie'];
  return { status: res.statusCode, cookie: header ? String(header).split(';')[0] : undefined, events: parseSse(res.body) };
}

const eventOf = <T>(sent: Sent, type: string): T[] => sent.events.filter((e) => e.event === type).map((e) => e.data as T);
const conversationIdOf = (sent: Sent): string => eventOf<{ conversation: { id: string } }>(sent, 'conversation')[0]!.conversation.id;

async function detail(id: string, cookie: string): Promise<ConversationDetail> {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/chat/conversations/${id}`, headers: { cookie } });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<ConversationDetail>();
}

beforeAll(async () => {
  fx = loadFixtures();
  chatPrompts = [];
  const fallback = fixtureResponder(fx);
  const gemini = new FakeProvider('gemini', responder(fallback), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', responder(fallback));
  ctx = await createTestApp({ providers: { gemini, groq } });
});

afterAll(async () => {
  await ctx.close();
});

describe('a typed product list', () => {
  it('needs no model to be understood', () => {
    expect(looksLikeProductList('adana, urfa, ayran')).toBe(true);
    expect(looksLikeProductList('Lahmacun\nAyran')).toBe(true);
    expect(looksLikeProductList('tatlı öner')).toBe(false);
    expect(looksLikeProductList('adana mı urfa mı, hangisi daha iyi?')).toBe(false);
    expect(looksLikeProductList('Su, Çay, Ayran')).toBe(true);
    expect(looksLikeProductList('merhaba, yeni bir restoranla görüşmeye başlıyorum')).toBe(false);
    expect(looksLikeProductList('iyi günler, kolay gelsin')).toBe(false);
  });

  it('is not a request with a comma in it (D-221)', () => {
    // Seen live: read as a two-product menu, it suggested products instead of options.
    expect(looksLikeProductList('kebaplara ve lahmacuna, pideye opsiyon ekstra malzeme ve çıkarılabilir malzeme öner')).toBe(false);
    expect(looksLikeProductList('mercimek, ezogelin için açıklama yaz')).toBe(false);
    expect(looksLikeProductList('adana, urfa ekle')).toBe(false);
    // Product names stay products, "Ekstra" in a name too.
    expect(looksLikeProductList('Adana Kebap, Ekstra Acılı Adana, Ayran')).toBe(true);
    expect(looksLikeProductList('Karışık Malzemeli Pizza, Kola')).toBe(true);
    expect(looksLikeProductList('Yaz Salatası, Çikolatalı Ekler, Ayran')).toBe(true);
  });
});

describe('the visitor cookie', () => {
  it('lists nothing and creates nobody before the first message', async () => {
    const before = await ctx.db.db.select({ id: users.id }).from(users);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/chat/conversations' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [] });
    expect(await ctx.db.db.select({ id: users.id }).from(users)).toHaveLength(before.length);
  });

  it('is set by the first message, on the stream itself, and identifies the browser after that', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran, Lahmacun' });
    expect(first.status).toBe(200);
    expect(first.cookie).toMatch(/^mk_visitor=/);

    const id = conversationIdOf(first);
    const second = await send({ conversationId: id, text: 'Selam' }, first.cookie);
    expect(second.cookie).toBeUndefined();

    const mine = await ctx.app.inject({ method: 'GET', url: '/api/v1/chat/conversations', headers: { cookie: first.cookie! } });
    expect(mine.json<{ data: { id: string }[] }>().data.map((c) => c.id)).toEqual([id]);
  });

  it('keeps one visitor out of another one\'s conversation', async () => {
    const owner = await send({ text: 'Mercimek Çorbası, Ezogelin' });
    const stranger = await send({ text: 'Ayran, Kola' });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/chat/conversations/${conversationIdOf(owner)}`,
      headers: { cookie: stranger.cookie! },
    });
    expect(res.statusCode).toBe(404);
    const posted = multipartBody({ conversationId: conversationIdOf(owner), text: 'merhaba' }, []);
    const write = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/chat/messages',
      headers: { ...posted.headers, cookie: stranger.cookie! },
      payload: posted.payload,
    });
    expect(write.statusCode).toBe(404);
  });

  it('opens nothing of the admin side', async () => {
    const { cookie } = await send({ text: 'Tost, Ayran' });
    for (const url of ['/api/v1/templates', '/api/v1/cuisines', '/api/v1/admin/overview', '/api/v1/settings/providers', '/api/v1/usage/summary']) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: { cookie: cookie! } });
      expect(res.statusCode, url).toBe(401);
    }
  });
});

describe('a conversation', () => {
  it('answers the first menu with a summary, cards and next steps', async () => {
    const sent = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    const [answer] = eventOf<{ message: ConversationDetail['messages'][number] }>(sent, 'message');
    expect(answer?.message.text).toContain('ürün okudum');
    // The opening checklist (D-206): one drink on a three-product menu is short of the ten-drink rule.
    expect(answer?.message.text).toContain('Açılış kurallarında eksik: içecek 1/10');
    expect(answer?.message.result?.counts?.quality?.drinks).toEqual({ current: 1, target: 10, ok: false });
    expect(answer?.message.quickReplies.length).toBeGreaterThan(0);
    expect(answer?.message.result?.cards.some((c) => c.section === 'new_product')).toBe(true);
    expect(answer?.message.result?.cards.some((c) => c.section === 'option')).toBe(true);

    const stored = await detail(conversationIdOf(sent), sent.cookie!);
    expect(stored.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(stored.messages[1]?.result?.runId).toBe(answer?.message.runId);
    expect(stored.title).toContain('ürün');
  });

  it('treats a screenshot with no menu on it as no menu at all', async () => {
    const empty = await send({}, undefined, NO_MENU);
    const [nothing] = eventOf<{ message: { text: string; result: unknown } }>(empty, 'message');
    expect(nothing?.message.text).toContain('okuyamadım');
    expect(nothing?.message.result).toBeNull();
    // No cuisine was read, so none names the conversation.
    expect((await detail(conversationIdOf(empty), empty.cookie!)).title).not.toContain('ürün');

    const sent = await send({ conversationId: conversationIdOf(empty), text: 'Adana Kebap, Urfa Kebap, Ayran' }, empty.cookie);
    const [answer] = eventOf<{ message: { text: string } }>(sent, 'message');
    expect(answer?.message.text).toContain('ürün okudum');
  });

  it('answers a question directly and with the menu in front of the model', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    decision = { ...noDecision, action: 'answer', reply: 'Şunu söyle: paket servis için dürüm iyi gider.' };
    chatPrompts.length = 0;
    const sent = await send({ conversationId: conversationIdOf(first), text: 'Restoran dürüm istemiyor, ne diyeyim?' }, first.cookie);
    const [answer] = eventOf<{ message: { text: string; runId: string | null } }>(sent, 'message');
    expect(answer?.message.text).toContain('dürüm');
    expect(answer?.message.runId).toBeNull();
    expect(chatPrompts[0]).toContain('Adana Kebap');
    expect(chatPrompts[0]).toContain('Açılış kurallarında eksik: içecek 1/10');
  });

  it('asks for a menu instead of recommending into the air', async () => {
    decision = { ...noDecision, action: 'recommend', reply: 'Hemen öneriyorum.', productCount: 5 };
    const sent = await send({ text: 'tatlı öner' });
    const [answer] = eventOf<{ message: { runId: string | null; text: string } }>(sent, 'message');
    expect(answer?.message.runId).toBeNull();
    // Never a bare "Bakıyorum.": it says what would move the call on.
    expect(answer?.message.text).toContain('mutfak türünü söyle');
  });

  it('starts from a cuisine named before any menu, and keeps it for what follows', async () => {
    // Seen live: "Uzak doğu mutfağı için öneri sun" with no menu stopped at "Bakıyorum.".
    decision = { ...noDecision, action: 'recommend', reply: 'Bakıyorum.', productCount: 5, cuisineSlug: 'uzak-dogu' };
    const first = await send({ text: 'Uzak doğu mutfağı için öneri sun' });
    const [start] = eventOf<{ message: { text: string; result: { cards: CardDto[]; counts: { cuisineName: string } } | null } }>(first, 'message');
    expect(start?.message.text).toContain('menüsüz başladım');
    expect(start?.message.result?.counts.cuisineName).toBe('Uzak Doğu');
    const offered = start?.message.result?.cards.filter((c) => c.section === 'new_product').map((c) => c.name) ?? [];
    expect(offered.length).toBeGreaterThan(0);

    const more = await send({ conversationId: conversationIdOf(first), text: 'Daha fazla ürün öner' }, first.cookie);
    const [next] = eventOf<{ message: { result: { cards: CardDto[] } } }>(more, 'message');
    const again = next?.message.result.cards.filter((c) => c.section === 'new_product').map((c) => c.name) ?? [];
    expect(again.length).toBeGreaterThan(0);
    expect(again.filter((name) => offered.includes(name))).toEqual([]);

    const typed = await send({ conversationId: conversationIdOf(first), text: 'California Roll, Somon Maki' }, first.cookie);
    const [menu] = eventOf<{ message: { result: { menu: { name: string }[]; counts: { cuisineName: string } } } }>(typed, 'message');
    expect(menu?.message.result.menu.length).toBe(2);
    expect(menu?.message.result.counts.cuisineName).toBe('Uzak Doğu');
  });

  it('takes one name the pool knows as the first product, without asking a model', async () => {
    // Seen live: "Lahmacun" alone was read as the cuisine "Pide & Lahmacun" and the menu stayed empty.
    chatPrompts.length = 0;
    const sent = await send({ text: 'Lahmacun' });
    const [answer] = eventOf<{ message: { result: { menu: { name: string }[] } | null } }>(sent, 'message');
    expect(answer?.message.result?.menu.map((m) => m.name)).toEqual(['Lahmacun']);
    expect(chatPrompts).toHaveLength(0);
  });

  it('starts the menu from a product named before it', async () => {
    decision = { ...noDecision, action: 'complete', reply: 'Bakıyorum.', targets: ['Adana Kebap'] };
    const sent = await send({ text: 'adana kebap için opsiyon yaz' });
    const [answer] = eventOf<{ message: { result: { menu: { name: string }[] } | null } }>(sent, 'message');
    expect(answer?.message.result?.menu.map((m) => m.name)).toEqual(['Adana Kebap']);
  });

  it('a follow-up runs only the slice that was asked for, and never offers a product twice', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    const id = conversationIdOf(first);
    const offered = (await detail(id, first.cookie!)).messages[1]!.result!.cards.filter((c) => c.section === 'new_product').map((c) => c.name);

    decision = { ...noDecision, action: 'recommend', reply: 'Tatlılara bakalım.', categoryKey: 'tatli', productCount: 3 };
    const sent = await send({ conversationId: id, text: 'Tatlı öner' }, first.cookie);
    const [answer] = eventOf<{ message: { text: string; result: { cards: CardDto[] } } }>(sent, 'message');
    const cards = answer?.message.result.cards ?? [];
    // The sentence comes from the cards, never from the model's guess before the guards ran.
    expect(answer?.message.text).not.toContain('Tatlılara bakalım');
    expect(cards.filter((c) => c.section === 'fix')).toHaveLength(0);
    expect(cards.filter((c) => c.section === 'option')).toHaveLength(0);
    for (const card of cards) {
      expect(card.categoryKey).toBe('tatli');
      expect(offered).not.toContain(card.name);
    }
  });

  it('runs the next-step buttons without asking the model what they mean', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    const [answer] = eventOf<{ message: { quickReplies: string[] } }>(first, 'message');
    const button = answer?.message.quickReplies.find((reply) => reply !== 'Daha fazla ürün öner');
    chatPrompts.length = 0;
    const sent = await send({ conversationId: conversationIdOf(first), text: button! }, first.cookie);
    expect(chatPrompts).toHaveLength(0);
    const [next] = eventOf<{ message: { runId: string | null; quickReplies: string[] } }>(sent, 'message');
    expect(next?.message.runId).not.toBeNull();
    expect(next?.message.quickReplies).toContain('Daha fazla ürün öner');
  });

  it('completes one named product of the menu', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    decision = { ...noDecision, action: 'complete', reply: 'Hazırlıyorum.', targets: ['Adana'] };
    const sent = await send({ conversationId: conversationIdOf(first), text: 'Adana için opsiyon yaz' }, first.cookie);
    const [answer] = eventOf<{ message: { result: { cards: CardDto[] } } }>(sent, 'message');
    const cards = answer?.message.result.cards ?? [];
    expect(cards.map((c) => c.section)).toEqual(['option']);
    expect(cards[0]?.targetName).toContain('Adana');
  });

  it('completes a product the menu does not show by adding it, instead of saying it is not there (D-221)', async () => {
    // Seen live: "makarnaya opsiyon öner" got "Şöyle söyle: menümüzde makarna bulunmuyor".
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    decision = { ...noDecision, action: 'complete', reply: 'Bakıyorum.', targets: ['Adana Kebap', 'Lahmacun'] };
    const sent = await send({ conversationId: conversationIdOf(first), text: 'adanaya ve lahmacuna opsiyon öner' }, first.cookie);
    const [answer] = eventOf<{ message: { text: string; result: { menu: { name: string }[]; cards: CardDto[]; counts: { current: number } } } }>(sent, 'message');
    expect(answer?.message.text).toContain('**Lahmacun** menüde yoktu, ekledim: şu an 4 ürün var.');
    const names = answer?.message.result.menu.map((m) => m.name) ?? [];
    expect(names).toContain('Lahmacun');
    // What was on the menu is not added twice.
    expect(names.filter((name) => name.includes('Adana'))).toHaveLength(1);
    const completed = answer?.message.result.cards.filter((c) => c.section === 'option').map((c) => c.targetName ?? '') ?? [];
    expect(completed.some((name) => name.includes('Lahmacun'))).toBe(true);
    expect(completed.some((name) => name.includes('Adana'))).toBe(true);
  });

  it('answers a request for descriptions with the descriptions, ready to paste (D-221)', async () => {
    // Seen live: "Diğer çorbalara açıklama yaz" was answered "opsiyon ve malzemeleri hazırladım", with no description.
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    decision = { ...noDecision, action: 'complete', reply: 'Bakıyorum.', targets: ['Adana Kebap', 'Urfa Kebap'] };
    const sent = await send({ conversationId: conversationIdOf(first), text: 'kebaplara açıklama yaz' }, first.cookie);
    const [answer] = eventOf<{ message: { text: string; result: { cards: CardDto[] } } }>(sent, 'message');
    const text = answer?.message.text ?? '';
    expect(text).toContain('Açıklamalar, panele yapıştırmaya hazır:');
    expect(text).not.toContain('opsiyon ve malzemeleri hazırladım');
    for (const card of answer?.message.result.cards.filter((c) => c.section === 'option') ?? []) {
      expect(text).toContain(`- **${card.targetName}:** ${card.shortDescription}`);
    }
  });

  it('starts the menu from products named with a request for their options, and says it completed them (D-221)', async () => {
    decision = { ...noDecision, action: 'complete', reply: 'Bakıyorum.', targets: ['Lahmacun', 'Kıymalı Pide'] };
    const sent = await send({ text: 'lahmacuna ve kıymalı pideye opsiyon ekstra malzeme öner' });
    const [answer] = eventOf<{ message: { text: string; result: { menu: { name: string }[] } | null } }>(sent, 'message');
    expect(answer?.message.result?.menu.map((m) => m.name).sort()).toEqual(['Kıymalı Pide', 'Lahmacun']);
    expect(answer?.message.text).toContain('için opsiyon ve malzemeleri hazırladım');
  });

  it('answers a screenshot sent with "açıklama önerir misin" with the descriptions first (D-221)', async () => {
    const image = Buffer.from(fx.images.get('menu-kebapci.jpg')!.data);
    const sent = await send({ text: 'ürünlere açıklama önerir misin' }, undefined, image);
    const [answer] = eventOf<{ message: { text: string; result: { cards: CardDto[] } | null } }>(sent, 'message');
    const lines = (answer?.message.text ?? '').split('\n');
    expect(lines[0]).toContain('ürün okudum');
    expect(lines[1]).toBe('Açıklamalar, panele yapıştırmaya hazır:');
    expect(lines[2]).toMatch(/^- \*\*.+:\*\* .+/u);
  });

  it('never answers "Menüyü güncelledim, şu an 0 ürün var" for an update that names nothing the rep said (D-222)', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    decision = { ...noDecision, action: 'update_menu', reply: 'Bakıyorum.', addProducts: ['Yeni İçecek'] };
    const sent = await send({ conversationId: conversationIdOf(first), text: 'başka şeyler de varmış' }, first.cookie);
    const [answer] = eventOf<{ message: { text: string; result: { cards: CardDto[]; counts: { current: number } } } }>(sent, 'message');
    expect(answer?.message.text).not.toContain('Menüyü güncelledim');
    expect(answer?.message.result.counts.current).toBe(3);
    expect(answer?.message.result.cards.some((c) => c.section === 'new_product')).toBe(true);
  });

  it('says what it completed when the words ask for options, whatever action the model chose (D-222)', async () => {
    decision = { ...noDecision, action: 'update_menu', reply: 'Bakıyorum.', addProducts: ['Lahmacun', 'Kıymalı Pide'] };
    const sent = await send({ text: 'lahmacun ve kıymalı pide var opsiyon sun malzeme sun' });
    const [answer] = eventOf<{ message: { text: string } }>(sent, 'message');
    expect(answer?.message.text).toContain('için opsiyon ve malzemeleri hazırladım');
  });

  it('says the options are on the cards when a cuisine start was asked for options (D-222)', async () => {
    decision = { ...noDecision, action: 'recommend', reply: 'Bakıyorum.', productCount: 5, cuisineSlug: 'uzak-dogu' };
    const sent = await send({ text: 'Suşici için opsiyon öner' });
    const [answer] = eventOf<{ message: { text: string } }>(sent, 'message');
    expect(answer?.message.text).toContain('menüsüz başladım');
    expect(answer?.message.text).toContain('Her ürün kartında açıklaması, opsiyonları');
  });

  it('reads "poğaça çeşitleri" as the product poğaça, not one called "Poğaça Çeşitleri" (D-222)', async () => {
    decision = { ...noDecision, action: 'update_menu', reply: 'Bakıyorum.', addProducts: ['Poğaça Çeşitleri'] };
    const sent = await send({ text: 'poğaça çeşitleri' });
    const [answer] = eventOf<{ message: { result: { menu: { name: string }[] } | null } }>(sent, 'message');
    expect(answer?.message.result?.menu.map((m) => m.name)).toEqual(['Poğaça']);
  });

  it('says it cannot open a link instead of pretending to read it, without a model (D-222)', async () => {
    // Seen live: a QR menu link was answered "Menüyü inceliyorum".
    chatPrompts.length = 0;
    const sent = await send({ text: 'https://ornek.example/menu/2599' });
    const [answer] = eventOf<{ message: { text: string; runId: string | null } }>(sent, 'message');
    expect(answer?.message.text).toContain('Bağlantıları açamıyorum');
    expect(answer?.message.runId).toBeNull();
    expect(chatPrompts).toHaveLength(0);
  });

  it('takes what it learned about the menu into the count', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    decision = { ...noDecision, action: 'update_menu', reply: 'Menüyü güncelledim.', addProducts: ['Lahmacun'], removeProducts: ['Ayran'] };
    const sent = await send({ conversationId: conversationIdOf(first), text: 'Lahmacun da varmış, ayran yokmuş' }, first.cookie);
    const [answer] = eventOf<{ message: { result: { menu: { name: string }[]; cards: CardDto[]; counts: { current: number } } } }>(sent, 'message');
    const names = answer?.message.result.menu.map((m) => m.name) ?? [];
    expect(names).toContain('Lahmacun');
    expect(names).not.toContain('Ayran');
    // What the restaurant just said it does not sell is not offered back in the same breath.
    expect(answer?.message.result.cards.map((c) => c.name)).not.toContain('Ayran');
    expect(answer?.message.result.counts.current).toBe(3);

    // Nor later in the call: the next round of products leaves it out too.
    const more = await send({ conversationId: conversationIdOf(first), text: 'Daha fazla ürün öner' }, first.cookie);
    const [next] = eventOf<{ message: { result: { cards: CardDto[] } } }>(more, 'message');
    expect(next?.message.result.cards.length).toBeGreaterThan(0);
    expect(next?.message.result.cards.map((c) => c.name)).not.toContain('Ayran');
  });

  it('adds to the menu only what the rep named', async () => {
    const first = await send({ text: 'Adana Kebap, Urfa Kebap, Ayran' });
    // Seen live: asked to drop the ayran, the model put a made-up product in its place.
    decision = { ...noDecision, action: 'update_menu', reply: 'Bakıyorum.', addProducts: ['Yeni İçecek'], removeProducts: ['Ayran'] };
    const sent = await send({ conversationId: conversationIdOf(first), text: 'ayranı artık satmıyorlarmış' }, first.cookie);
    const [answer] = eventOf<{ message: { result: { menu: { name: string }[] } } }>(sent, 'message');
    expect(answer?.message.result.menu.map((m) => m.name).sort()).toEqual(['Adana Kebap', 'Urfa Kebap']);
  });
});

describe('what a visitor may write', () => {
  it('cannot touch the shared pool or the learning loop', async () => {
    const first = await send({ text: 'Adana Kebap, Kuzu Şiş, Tavuk Kanat, Ayran' });
    const [answer] = eventOf<{ message: { result: { cards: CardDto[] } } }>(first, 'message');
    const card = answer?.message.result.cards[0];
    for (const action of ['accept', 'skip', 'later']) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/suggestion-items/${card?.id}/${action}`,
        headers: { cookie: first.cookie!, 'content-type': 'application/json' },
        payload: {},
      });
      expect(res.statusCode, action).toBe(401);
    }
  });

  /** An empty message from an address, as a visitor or as a newcomer: the door answers 400 once it lets it in. */
  const emptyFrom = (address: string, cookie?: string) => {
    const body = multipartBody({}, []);
    return ctx.app.inject({
      method: 'POST',
      url: '/api/v1/chat/messages',
      headers: { ...body.headers, ...(cookie ? { cookie } : {}) },
      payload: body.payload,
      remoteAddress: address,
    });
  };
  /** A new rep: its first (empty) message creates the visitor, and the cookie comes back with the 400. */
  const visitorAt = async (address: string): Promise<string> => {
    const res = await emptyFrom(address);
    expect(res.statusCode).toBe(400);
    const cookie = String(res.headers['set-cookie']).split(';')[0]!;
    expect(cookie).toMatch(/^mk_visitor=/);
    return cookie;
  };

  it('is generous with one office: 30 a minute per rep, 200 new reps and 600 messages per address (D-215)', () => {
    expect(CHAT_LIMITS).toEqual({ perVisitor: 30, newPerAddress: 200, perAddress: 600 });
  });

  it('stops an address minting visitors only past 200 a minute, before anything is created (D-215)', async () => {
    for (let i = 0; i < CHAT_LIMITS.newPerAddress; i += 1) expect((await emptyFrom('10.9.9.9')).statusCode).toBe(400);
    const visitors = await ctx.db.db.select({ id: users.id }).from(users);
    const stopped = await emptyFrom('10.9.9.9');
    expect(stopped.statusCode).toBe(429);
    expect(stopped.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(await ctx.db.db.select({ id: users.id }).from(users)).toHaveLength(visitors.length);
  });

  it('stops one rep past 30 messages a minute, but not a colleague behind the same office address (D-215)', async () => {
    const office = '10.9.8.1';
    const rep = await visitorAt(office);
    const colleague = await visitorAt(office);
    // The first message came before the cookie existed, as a newcomer of the address: thirty more with the cookie.
    for (let i = 0; i < CHAT_LIMITS.perVisitor; i += 1) expect((await emptyFrom(office, rep)).statusCode).toBe(400);
    expect((await emptyFrom(office, rep)).statusCode).toBe(429);
    expect((await emptyFrom(office, colleague)).statusCode).toBe(400);
    // A forged cookie borrows nobody's allowance: an invalid token counts as a newcomer of the address.
    expect((await emptyFrom(office, 'mk_visitor=forged.token.value')).statusCode).toBe(400);
  });

  it('holds a whole address to 600 messages a minute however many reps share it (D-215)', async () => {
    const office = '10.9.7.1';
    const reps: string[] = [];
    for (let i = 0; i < 22; i += 1) reps.push(await visitorAt(office));
    // 22 first messages + 578 more spread over the 22: none reaches its own 30, the address reaches 600.
    for (let i = 0; i < CHAT_LIMITS.perAddress - reps.length; i += 1) {
      expect((await emptyFrom(office, reps[i % reps.length])).statusCode).toBe(400);
    }
    expect((await emptyFrom(office, reps[0])).statusCode).toBe(429);
    expect((await emptyFrom(office)).statusCode).toBe(429);
    // Another address is untouched.
    expect((await emptyFrom('10.9.7.2', reps[1])).statusCode).toBe(400);
  });

  it('counts an IPv6 connection by its /64, so changing the last part of the address mints no more (D-215)', async () => {
    for (let i = 0; i < CHAT_LIMITS.newPerAddress; i += 1) {
      expect((await emptyFrom(`2001:db8:5:6::${(i + 1).toString(16)}`)).statusCode).toBe(400);
    }
    expect((await emptyFrom('2001:db8:5:6:ffff:ffff:ffff:ffff')).statusCode).toBe(429);
    expect((await emptyFrom('2001:db8:5:7::1')).statusCode).toBe(400);
  });

  it('cannot start a run around the rate limited door', async () => {
    const { cookie } = await send({ text: 'Tost, Ayran' });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/analyze', headers: { cookie: cookie! }, payload: { menuText: 'Tost, Ayran' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('the admin panel', () => {
  it('sees every visitor\'s conversations and the day in numbers', async () => {
    const sent = await send({ text: 'Adana Kebap, Ayran' });
    const { accessToken } = await loginAs(ctx);
    const overview = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: bearer(accessToken) });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json<{ conversations: number; runs: number }>().conversations).toBeGreaterThan(0);
    const week = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/overview?range=week', headers: bearer(accessToken) });
    const dashboard = week.json<{ daily: { runs: number }[]; quality: { runs: number; drinks: number }; pool: { templates: number; thin: { templates: number }[] }; feedback: { new: number } }>();
    expect(dashboard.daily).toHaveLength(14);
    expect(dashboard.daily.at(-1)?.runs).toBeGreaterThan(0);
    expect(dashboard.quality.runs).toBeGreaterThan(0);
    expect(dashboard.quality.drinks).toBeGreaterThan(0);
    expect(dashboard.pool.templates).toBeGreaterThan(400);
    // Each thin cuisine still has its own seed templates: a zero here means the count query lost its join.
    expect(dashboard.pool.thin.every((c) => c.templates > 0)).toBe(true);
    expect(dashboard.feedback.new).toBe(0);

    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/conversations', headers: bearer(accessToken) });
    const rows = list.json<{ data: { id: string; visitor: string }[] }>().data;
    expect(rows.map((r) => r.id)).toContain(conversationIdOf(sent));

    const one = await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/conversations/${conversationIdOf(sent)}`, headers: bearer(accessToken) });
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json<ConversationDetail>().messages.length).toBeGreaterThan(1);
  });
});

describe('when every model is busy', () => {
  it('says so, rather than that the screenshot holds no menu', async () => {
    // An app of its own: the failures open the providers' circuit breaker, which would leak into every later test.
    const shared = ctx;
    const fallback = fixtureResponder(fx);
    ctx = await createTestApp({
      providers: {
        gemini: new FakeProvider('gemini', responder(fallback), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim))),
        groq: new FakeProvider('groq', responder(fallback)),
      },
    });
    extractDown = true;
    try {
      // Other bytes than NO_MENU: a read image is cached by its hash and would never reach a model.
      const sent = await send({}, undefined, Buffer.concat([NO_MENU, Buffer.from('busy')]));
      const [answer] = eventOf<{ message: { text: string; result: unknown } }>(sent, 'message');
      expect(answer?.message.text).toContain('yoğun');
      expect(answer?.message.text).not.toContain('okuyamadım');
      expect(answer?.message.result).toBeNull();
    } finally {
      extractDown = false;
      await ctx.close();
      ctx = shared;
    }
  }, 30_000);
});
