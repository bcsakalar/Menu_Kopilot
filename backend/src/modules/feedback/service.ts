import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { conversations, feedback, users } from '../../db/schema/index.js';
import { notFound } from '../../lib/errors.js';
import type { CreateFeedbackInput, FeedbackDto, UpdateFeedbackInput } from './schemas.js';

type Status = FeedbackDto['status'];

export class FeedbackService {
  constructor(private readonly db: Database) {}

  async create(userId: string, input: CreateFeedbackInput): Promise<{ id: string }> {
    // A conversation id is only kept when it is this visitor's own: feedback cannot point the panel at someone else's call.
    let conversationId: string | null = null;
    if (input.conversationId) {
      const [own] = await this.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId)));
      conversationId = own?.id ?? null;
    }
    const [row] = await this.db
      .insert(feedback)
      .values({ userId, conversationId, kind: input.kind, message: input.message, authorName: input.name })
      .returning({ id: feedback.id });
    if (!row) throw new Error('feedback insert returned no row');
    return row;
  }

  private select() {
    return this.db
      .select({
        id: feedback.id,
        kind: feedback.kind,
        message: feedback.message,
        authorName: feedback.authorName,
        status: feedback.status,
        adminNote: feedback.adminNote,
        conversationId: feedback.conversationId,
        conversationTitle: conversations.title,
        visitorEmail: users.email,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      })
      .from(feedback)
      .leftJoin(conversations, eq(conversations.id, feedback.conversationId))
      .leftJoin(users, eq(users.id, feedback.userId));
  }

  private toDto(row: Awaited<ReturnType<FeedbackService['select']>>[number]): FeedbackDto {
    return {
      id: row.id,
      kind: row.kind,
      message: row.message,
      authorName: row.authorName,
      status: row.status,
      adminNote: row.adminNote,
      conversationId: row.conversationId,
      conversationTitle: row.conversationTitle,
      visitor: (row.visitorEmail ?? '').slice(0, 8),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async counts(): Promise<Record<Status, number>> {
    const rows = await this.db.select({ status: feedback.status, n: sql<number>`count(*)::int` }).from(feedback).groupBy(feedback.status);
    const counts: Record<Status, number> = { new: 0, seen: 0, done: 0 };
    for (const r of rows) counts[r.status] = r.n;
    return counts;
  }

  async list(query: { status?: Status | undefined; limit: number; before?: string | undefined }) {
    const rows = await this.select()
      .where(
        and(
          query.status ? eq(feedback.status, query.status) : undefined,
          query.before ? lt(feedback.createdAt, new Date(query.before)) : undefined,
        ),
      )
      .orderBy(desc(feedback.createdAt))
      .limit(query.limit);
    return {
      data: rows.map((r) => this.toDto(r)),
      counts: await this.counts(),
      nextBefore: rows.length === query.limit ? (rows.at(-1)?.createdAt.toISOString() ?? null) : null,
    };
  }

  async update(id: string, input: UpdateFeedbackInput): Promise<FeedbackDto> {
    const [updated] = await this.db
      .update(feedback)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
        updatedAt: new Date(),
      })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id });
    if (!updated) throw notFound('Geri bildirim');
    const [row] = await this.select().where(eq(feedback.id, id));
    if (!row) throw notFound('Geri bildirim');
    return this.toDto(row);
  }
}
