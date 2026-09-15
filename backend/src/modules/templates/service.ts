import { isDeepStrictEqual } from 'node:util';
import { type SQL, and, asc, desc, eq, exists, ilike, inArray, ne, sql } from 'drizzle-orm';
import type { Database, Executor } from '../../db/client.js';
import { cuisines, itemAliases, menuItems } from '../../db/schema/index.js';
import type { JobQueue } from '../../jobs/queue.js';
import { AppError, isUniqueViolation, notFound } from '../../lib/errors.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type {
  CreateTemplateInput,
  TemplateDto,
  TemplateListQuery,
  UpdateTemplateInput,
} from './schemas.js';
import { type TemplateRecord, addAliases, getTemplate, getTemplates, insertTemplate, replaceTemplateContent } from './template-store.js';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Template pool ("Şablon havuzu"): search / filter / sort, create, edit, delete. Edits by the user always make the
 * template `source='user'` (a seed edited once is never overwritten by re-seeding). Deleting a seed template archives
 * it (approved=false) so the startup seed does not bring it back.
 */
export class TemplateService {
  constructor(
    private readonly db: Database,
    private readonly queue: JobQueue,
  ) {}

  private async cuisineNames(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: cuisines.id, name: cuisines.name })
      .from(cuisines)
      .where(inArray(cuisines.id, [...new Set(ids)]));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private toDto(record: TemplateRecord, cuisineName: string): TemplateDto {
    return {
      id: record.id,
      cuisineId: record.cuisineId,
      cuisineName,
      name: record.canonicalName,
      source: record.source,
      approved: record.approved,
      needsReview: record.needsReview,
      importance: record.importance,
      usageCount: record.usageCount,
      aliases: record.aliases,
      payload: record.payload,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async list(query: TemplateListQuery): Promise<{ data: TemplateDto[]; meta: { total: number; limit: number; offset: number } }> {
    const conditions: SQL[] = [];
    if (query.approved !== 'all') conditions.push(eq(menuItems.approved, query.approved === 'true'));
    if (query.cuisineId) conditions.push(eq(menuItems.cuisineId, query.cuisineId));
    if (query.source) conditions.push(eq(menuItems.source, query.source));
    const q = query.q ? normalizeTr(query.q) : '';
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      const aliasMatch = this.db
        .select({ one: sql`1` })
        .from(itemAliases)
        .where(and(eq(itemAliases.menuItemId, menuItems.id), ilike(itemAliases.normalizedAlias, pattern)));
      conditions.push(sql`(${ilike(menuItems.normalizedName, pattern)} or ${exists(aliasMatch)})`);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    // Sorting on the ASCII-folded name keeps Ç/İ/Ş names in place regardless of the database collation.
    const order =
      query.sort === 'name'
        ? [asc(menuItems.normalizedName)]
        : query.sort === 'updated'
          ? [desc(menuItems.updatedAt), asc(menuItems.normalizedName)]
          : [desc(menuItems.usageCount), desc(menuItems.importance), asc(menuItems.normalizedName)];
    const [count] = await this.db.select({ n: sql<number>`count(*)::int` }).from(menuItems).where(where);
    const rows = await this.db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(where)
      .orderBy(...order)
      .limit(query.limit)
      .offset(query.offset);
    const records = await getTemplates(
      this.db,
      rows.map((r) => r.id),
    );
    const names = await this.cuisineNames(records.map((r) => r.cuisineId));
    return {
      data: records.map((r) => this.toDto(r, names.get(r.cuisineId) ?? '')),
      meta: { total: count?.n ?? 0, limit: query.limit, offset: query.offset },
    };
  }

  async get(id: string): Promise<TemplateDto> {
    const record = await getTemplate(this.db, id);
    if (!record) throw notFound('Şablon');
    const names = await this.cuisineNames([record.cuisineId]);
    return this.toDto(record, names.get(record.cuisineId) ?? '');
  }

  private async requireCuisine(cuisineId: string): Promise<void> {
    const [row] = await this.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.id, cuisineId)).limit(1);
    if (!row) throw new AppError('VALIDATION_ERROR', 'Mutfak türü bulunamadı');
  }

  private conflict(err: unknown): never {
    if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'Bu mutfakta aynı isimde onaylı başka bir şablon var');
    throw err;
  }

  /** Replaces the alias list (keeps rows that stay, deletes removed ones). */
  private async setAliases(db: Executor, id: string, list: readonly string[], canonicalName: string): Promise<void> {
    const wanted = new Set(list.map(normalizeTr).filter((a) => a !== '' && a !== normalizeTr(canonicalName)));
    const current = await db
      .select({ id: itemAliases.id, normalized: itemAliases.normalizedAlias })
      .from(itemAliases)
      .where(eq(itemAliases.menuItemId, id));
    const stale = current.filter((a) => !wanted.has(a.normalized)).map((a) => a.id);
    if (stale.length > 0) await db.delete(itemAliases).where(inArray(itemAliases.id, stale));
    await addAliases(db, id, list, canonicalName);
  }

  async create(userId: string, input: CreateTemplateInput): Promise<TemplateDto> {
    await this.requireCuisine(input.cuisineId);
    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        // An unapproved AI draft with the same name is replaced by the user's template.
        await tx
          .delete(menuItems)
          .where(
            and(
              eq(menuItems.cuisineId, input.cuisineId),
              eq(menuItems.normalizedName, normalizeTr(input.payload.name)),
              eq(menuItems.approved, false),
              ne(menuItems.source, 'seed'),
            ),
          );
        return insertTemplate(tx, {
          cuisineId: input.cuisineId,
          payload: input.payload,
          source: 'user',
          approved: true,
          importance: input.importance ?? 50,
          aliases: input.aliases ?? [],
          createdBy: userId,
        });
      });
    } catch (err) {
      this.conflict(err);
    }
    await this.queue.enqueueEmbedding([id]);
    return this.get(id);
  }

  async update(id: string, input: UpdateTemplateInput): Promise<TemplateDto> {
    const current = await getTemplate(this.db, id);
    if (!current) throw notFound('Şablon');
    if (input.cuisineId) await this.requireCuisine(input.cuisineId);
    const payload = input.payload ?? current.payload;
    const contentChanged = input.payload !== undefined && !isDeepStrictEqual(input.payload, current.payload);
    const moved = input.cuisineId !== undefined && input.cuisineId !== current.cuisineId;
    try {
      await this.db.transaction(async (tx) => {
        if (contentChanged || moved || input.approved !== undefined || input.importance !== undefined) {
          await replaceTemplateContent(tx, id, payload, {
            ...(contentChanged || moved ? { source: 'user' as const } : {}),
            ...(input.cuisineId !== undefined ? { cuisineId: input.cuisineId } : {}),
            ...(input.importance !== undefined ? { importance: input.importance } : {}),
            ...(input.approved !== undefined ? { approved: input.approved, needsReview: false } : {}),
          });
        }
        if (input.aliases !== undefined) await this.setAliases(tx, id, input.aliases, payload.name);
      });
    } catch (err) {
      this.conflict(err);
    }
    const updated = await this.get(id);
    if (updated.approved) await this.queue.enqueueEmbedding([id]);
    return updated;
  }

  async remove(id: string): Promise<{ archived: boolean }> {
    const current = await getTemplate(this.db, id);
    if (!current) throw notFound('Şablon');
    if (current.source !== 'seed') {
      await this.db.delete(menuItems).where(eq(menuItems.id, id));
      return { archived: false };
    }
    await this.db.transaction(async (tx) => {
      // Unique (cuisine, name, approved): an unapproved draft with the same name gives way to the archived seed.
      await tx
        .delete(menuItems)
        .where(
          and(
            eq(menuItems.cuisineId, current.cuisineId),
            eq(menuItems.normalizedName, current.normalizedName),
            eq(menuItems.approved, false),
            ne(menuItems.id, id),
          ),
        );
      await tx.update(menuItems).set({ approved: false, needsReview: false, updatedAt: new Date() }).where(eq(menuItems.id, id));
    });
    return { archived: true };
  }
}
