import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { EmbeddingService, EmbedReport } from './embedding.service.js';

/** Background jobs. BullMQ in runtime; an inline implementation for tests and LOCAL runs. */
export interface JobQueue {
  enqueueEmbedding(menuItemIds: readonly string[]): Promise<void>;
  close(): Promise<void>;
}

export const EMBEDDING_QUEUE = 'embeddings';
const SWEEP_JOB = 'embed-missing';
const EMBED_JOB = 'embed-items';

/** Runs embedding work immediately (awaited). Errors are swallowed like a background job would. */
export class InlineJobQueue implements JobQueue {
  readonly enqueued: string[] = [];

  constructor(private readonly embedding?: EmbeddingService) {}

  async enqueueEmbedding(menuItemIds: readonly string[]): Promise<void> {
    this.enqueued.push(...menuItemIds);
    if (!this.embedding) return;
    try {
      await this.embedding.embedTemplates(menuItemIds);
    } catch {
      // background semantics: never fail the caller
    }
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

interface EmbedJobData {
  ids: string[];
}

export class BullJobQueue implements JobQueue {
  private readonly connection: Redis;
  private readonly queue: Queue<EmbedJobData>;

  constructor(redisUrl: string) {
    // BullMQ requires maxRetriesPerRequest: null on its connections.
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<EmbedJobData>(EMBEDDING_QUEUE, { connection: this.connection });
  }

  async enqueueEmbedding(menuItemIds: readonly string[]): Promise<void> {
    if (menuItemIds.length === 0) return;
    await this.queue.add(
      EMBED_JOB,
      { ids: [...menuItemIds] },
      {
        attempts: 8,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );
  }

  /** Repeating sweep that embeds approved templates still missing a vector (e.g. after key rotation). */
  async scheduleSweep(everyMs = 30 * 60_000): Promise<void> {
    await this.queue.upsertJobScheduler(SWEEP_JOB, { every: everyMs }, { name: SWEEP_JOB, data: { ids: [] } });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export function startEmbeddingWorker(
  redisUrl: string,
  embedding: EmbeddingService,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
): { close: () => Promise<void> } {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker<EmbedJobData, EmbedReport>(
    EMBEDDING_QUEUE,
    async (job) => {
      const ids = job.name === SWEEP_JOB ? await embedding.findMissing(100) : job.data.ids;
      const report = await embedding.embedTemplates(ids);
      if (report.failed > 0 && job.name !== SWEEP_JOB && report.retryable !== false) {
        // Retry later with backoff (provider down / rate limited). A missing key, local-only mode or a used-up quota
        // does not burn retries: the sweeper catches those templates once the configuration is fixed.
        throw new Error(report.error ?? 'embedding failed');
      }
      return report;
    },
    { connection, concurrency: 1 },
  );
  worker.on('completed', (job, result) => log.info({ jobId: job.id, result }, 'embedding job completed'));
  worker.on('failed', (job, err) => log.warn({ jobId: job?.id, err: err.message }, 'embedding job failed'));
  return {
    close: async () => {
      await worker.close();
      await connection.quit();
    },
  };
}
