import { isDeepStrictEqual } from 'node:util';
import { type SQL, and, asc, desc, eq, exists, ilike, inArray, ne, sql } from 'drizzle-orm';
import type { Database, Executor } from '../../db/client.js';
import { cuisines, itemAliases, menuItems } from '../../db/schema/index.js';
import type { JobQueue } from '../../jobs/queue.js';
import { AppError, isUniqueViolation, notFound } from '../../lib/errors.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { MIN_BRANCH_ITEMS } from '../../agents/gap-analyst.js';
import {
  type CuisineRef,
  type RowError,
  parseTemplateRows,
  readTemplateSheet,
  sampleEntries,
  templateWorkbook,
} from './excel.js';
import type {
  CreateTemplateInput,
  ImportReport,
  TemplateDto,
  TemplateListQuery,
  UpdateTemplateInput,
} from './schemas.js';
import { type TemplateRecord, addAliases, getTemplate, getTemplates, insertTemplate, replaceTemplateContent } from './template-store.js';

/** Approved templates per cuisine (one grouped query; a correlated subquery here loses the outer table name). */
export async function approvedCounts(db: Executor): Promise<Map<string, number>> {
  const rows = await db
    .select({ cuisineId: menuItems.cuisineId, n: sql<number>`count(*)::int` })
    .from(menuItems)
    .where(eq(menuItems.approved, true))
    .groupBy(menuItems.cuisineId);
  return new Map(rows.map((r) => [r.cuisineId, r.n]));
}

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

  // ---- Excel (D-206) ------------------------------------------------------------------------------------------

  /** Every cuisine with its approved template count and opening target: the sample's "Mutfaklar" sheet. */
  async cuisineRefs(): Promise<CuisineRef[]> {
    const rows = await this.db
      .select({ id: cuisines.id, name: cuisines.name, slug: cuisines.slug, minItemCount: cuisines.minItemCount })
      .from(cuisines)
      .orderBy(asc(cuisines.name));
    const counts = await approvedCounts(this.db);
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, templates: counts.get(r.id) ?? 0, target: Math.max(MIN_BRANCH_ITEMS, r.minItemCount) }));
  }

  async sampleWorkbook(): Promise<Buffer> {
    const refs = await this.cuisineRefs();
    return templateWorkbook(sampleEntries(refs), refs);
  }

  /** The approved pool (one cuisine or all) in the import layout: edit it in Excel and load it back. */
  async exportWorkbook(cuisineId?: string): Promise<Buffer> {
    const refs = await this.cuisineRefs();
    const ids = await this.db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.approved, true), cuisineId ? eq(menuItems.cuisineId, cuisineId) : undefined))
      .orderBy(asc(menuItems.cuisineId), desc(menuItems.importance), asc(menuItems.normalizedName));
    const records = await getTemplates(
      this.db,
      ids.map((r) => r.id),
    );
    const names = new Map(refs.map((r) => [r.id, r.name]));
    const entries = records
      .map((r) => ({ cuisineName: names.get(r.cuisineId) ?? '', aliases: r.aliases, importance: r.importance, payload: r.payload }))
      .sort((a, b) => a.cuisineName.localeCompare(b.cuisineName, 'tr') || b.importance - a.importance);
    return templateWorkbook(entries, refs);
  }

  /**
   * Loads a filled sheet into the pool. Rows that fail validation are reported and skipped; the rest are created
   * or updated (matched on cuisine + name) as `source='imported'`, which re-seeding never overwrites. With
   * `dryRun` nothing is written: the same report is the preview the panel shows before the real import.
   */
  async importWorkbook(userId: string, file: Buffer, dryRun: boolean): Promise<ImportReport> {
    let sheetRows: Awaited<ReturnType<typeof readTemplateSheet>>;
    try {
      sheetRows = await readTemplateSheet(file);
    } catch (err) {
      const message = err instanceof Error && err.message.includes('Ürün Adı') ? err.message : 'Dosya okunamadı: .xlsx biçiminde bir Excel dosyası yükle.';
      throw new AppError('VALIDATION_ERROR', message);
    }
    if (sheetRows.length === 0) throw new AppError('VALIDATION_ERROR', 'Dosyada ürün satırı yok.');
    if (sheetRows.length > 2000) throw new AppError('VALIDATION_ERROR', 'Bir dosyada en fazla 2000 ürün olabilir; dosyayı böl.');

    const refs = await this.cuisineRefs();
    const existingRows = await this.db
      .select({ id: menuItems.id, cuisineId: menuItems.cuisineId, normalizedName: menuItems.normalizedName })
      .from(menuItems)
      .where(eq(menuItems.approved, true));
    const existingId = new Map(existingRows.map((r) => [`${r.cuisineId}|${r.normalizedName}`, r.id]));
    const wantedKeys = new Set(
      sheetRows.flatMap((r) => {
        const cuisine = normalizeTr(r.cells.cuisine ?? '');
        return refs
          .filter((c) => normalizeTr(c.name) === cuisine || normalizeTr(c.slug) === cuisine)
          .map((c) => `${c.id}|${normalizeTr(r.cells.name ?? '')}`);
      }),
    );
    const records = await getTemplates(
      this.db,
      [...wantedKeys].map((k) => existingId.get(k)).filter((id): id is string => id !== undefined),
    );
    const recordByKey = new Map(records.map((r) => [`${r.cuisineId}|${r.normalizedName}`, r]));
    const { valid, errors } = parseTemplateRows(sheetRows, refs, (cuisineId, name) => recordByKey.get(`${cuisineId}|${name}`)?.payload);

    const cuisineName = new Map(refs.map((r) => [r.id, r.name]));
    const items: ImportReport['items'] = [];
    const written: string[] = [];
    const rowErrors: RowError[] = [...errors];
    const work = async (tx: Executor) => {
      for (const row of valid) {
        const record = recordByKey.get(`${row.cuisineId}|${normalizeTr(row.payload.name)}`);
        const same =
          record !== undefined &&
          isDeepStrictEqual(record.payload, row.payload) &&
          (row.importance === undefined || row.importance === record.importance) &&
          (row.aliases.length === 0 || isDeepStrictEqual([...record.aliases].map(normalizeTr).sort(), row.aliases.map(normalizeTr).sort()));
        const action = record === undefined ? 'create' : same ? 'same' : 'update';
        const item = { row: row.row, name: row.payload.name, cuisine: cuisineName.get(row.cuisineId) ?? '', action } as const;
        if (dryRun || action === 'same') {
          items.push(item);
          continue;
        }
        try {
          // A savepoint per row: one alias clash must not undo the rest of the file.
          const id = await tx.transaction(async (sp) => {
            if (record) {
              await replaceTemplateContent(sp, record.id, row.payload, {
                source: 'imported',
                ...(row.importance !== undefined ? { importance: row.importance } : {}),
              });
              if (row.aliases.length > 0) await this.setAliases(sp, record.id, row.aliases, row.payload.name);
              return record.id;
            }
            await sp
              .delete(menuItems)
              .where(
                and(
                  eq(menuItems.cuisineId, row.cuisineId),
                  eq(menuItems.normalizedName, normalizeTr(row.payload.name)),
                  eq(menuItems.approved, false),
                  ne(menuItems.source, 'seed'),
                ),
              );
            return insertTemplate(sp, {
              cuisineId: row.cuisineId,
              payload: row.payload,
              source: 'imported',
              approved: true,
              importance: row.importance ?? 50,
              aliases: row.aliases,
              createdBy: userId,
            });
          });
          written.push(id);
          items.push(item);
        } catch (err) {
          rowErrors.push({
            row: row.row,
            name: row.payload.name,
            message: isUniqueViolation(err) ? 'Takma adlardan biri başka bir ürünle çakışıyor' : 'Kaydedilemedi',
          });
        }
      }
    };
    if (dryRun) await work(this.db);
    else await this.db.transaction(work);
    if (written.length > 0) await this.queue.enqueueEmbedding(written);

    const count = (action: ImportReport['items'][number]['action']) => items.filter((i) => i.action === action).length;
    return {
      dryRun,
      rows: sheetRows.length,
      created: count('create'),
      updated: count('update'),
      unchanged: count('same'),
      items,
      errors: rowErrors.sort((a, b) => a.row - b.row),
    };
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
