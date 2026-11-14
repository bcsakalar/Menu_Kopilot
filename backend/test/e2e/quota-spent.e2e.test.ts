import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AI_SPENT } from '../../src/agents/chat.js';
import type { CardDto, CountsDto } from '../../src/modules/analyze/schemas.js';
import { multipartBody, parseSse } from '../helpers/fixtures.js';
import { createTestApp, type TestContext } from '../helpers/test-app.js';

/**
 * The end of a busy day (D-216): the site's model quota is spent. In the QR menu a shared daily limit left every rep
 * stuck by the afternoon; here nothing waits for the models: what the pool can answer it answers, and what needs a
 * model says so plainly, instead of "try again in a few seconds" or "no menu in this picture".
 */

let ctx: TestContext;
let host = 0;

/** One white pixel: a screenshot nobody can read today. */
const SCREENSHOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

interface Reply {
  text: string;
  quickReplies: string[];
  result: { cards: CardDto[]; counts: CountsDto | null } | null;
}

async function send(text: string, cookie?: string, image?: Buffer): Promise<{ reply: Reply; cookie: string }> {
  host += 1;
  const body = multipartBody({ text }, image ? [{ name: 'images', filename: 'menu.png', contentType: 'image/png', data: image }] : []);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/chat/messages',
    headers: { ...body.headers, ...(cookie ? { cookie } : {}) },
    payload: body.payload,
    remoteAddress: `10.40.0.${host}`,
  });
  expect(res.statusCode).toBe(200);
  const message = parseSse(res.body).find((e) => e.event === 'message')?.data as { message: Reply };
  return { reply: message.message, cookie: cookie ?? String(res.headers['set-cookie']).split(';')[0]! };
}

beforeAll(async () => {
  // A ceiling of zero: the day's quota is spent before the first message.
  ctx = await createTestApp({ env: { GLOBAL_DAILY_LLM_CALL_QUOTA: '0' } });
});

afterAll(async () => {
  await ctx.close();
});

describe('a spent daily quota (D-216)', () => {
  it('says the quota is spent when a screenshot cannot be read, not that the picture has no menu', async () => {
    const { reply } = await send('', undefined, SCREENSHOT);
    expect(reply.text).toBe(AI_SPENT);
    expect(reply.text).not.toContain('menü okuyamadım');
  });

  it('still starts a named cuisine from the pool without a model', async () => {
    const { reply } = await send('Uzak Doğu için öneri sun');
    expect(reply.result?.counts?.cuisineName).toBe('Uzak Doğu');
    expect(reply.result?.cards.filter((c) => c.section === 'new_product').length ?? 0).toBeGreaterThanOrEqual(10);
    expect(reply.text).not.toBe(AI_SPENT);
  });

  it('still answers a typed list from the pool, and says the quota is spent for a question only a model can answer', async () => {
    const first = await send('Adana Kebap, Lahmacun, Ayran');
    expect(first.reply.result?.counts?.current).toBe(3);
    expect(first.reply.result?.cards.length ?? 0).toBeGreaterThan(0);
    const question = await send('Bu restorana hangi kampanyayı önerirsin?', first.cookie);
    expect(question.reply.text).toBe(AI_SPENT);
    // The buttons need no model and keep working: the menu has one drink, the drink button brings more.
    expect(first.reply.quickReplies).toContain('İçecek öner');
    const drinks = await send('İçecek öner', first.cookie);
    expect(drinks.reply.result?.cards.filter((c) => c.section === 'new_product').length ?? 0).toBeGreaterThan(0);
  });
});
