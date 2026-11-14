/**
 * At most `size` jobs run at once; the rest wait in arrival order (D-214). An analysis holds the menu, its images and
 * up to a dozen model calls in memory on a small server, and twenty of them started at the same second all slow down
 * together; a queue keeps the ones that run fast and tells the others where they stand.
 */

interface Waiter {
  start: () => void;
  onWait: ((position: number) => void) | undefined;
}

export interface SlotStats {
  size: number;
  running: number;
  waiting: number;
  /** How long the jobs that had to wait waited, most recent last (at most `WAIT_SAMPLES`). */
  waitsMs: readonly number[];
}

const WAIT_SAMPLES = 200;

export class Slots {
  private running = 0;
  private readonly waiting: Waiter[] = [];
  private readonly waits: number[] = [];

  constructor(
    readonly size: number,
    /** Beyond this many waiting jobs a new one is turned away instead of holding another open stream. */
    readonly maxWaiting: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Every slot taken and the queue full: the caller says "busy" now rather than after a long wait. */
  get full(): boolean {
    return this.running >= this.size && this.waiting.length >= this.maxWaiting;
  }

  stats(): SlotStats {
    return { size: this.size, running: this.running, waiting: this.waiting.length, waitsMs: [...this.waits] };
  }

  /**
   * Runs `work` in a slot. `onWait` hears the job's place in the queue (1 = next) when it has to wait and whenever the
   * place changes. A job whose `signal` aborts while it waits leaves the queue and runs at once without a slot: it only
   * has to notice the abort and finish as cancelled.
   */
  async run<T>(work: () => Promise<T>, options: { onWait?: (position: number) => void; signal?: AbortSignal } = {}): Promise<T> {
    const holds = await this.enter(options.onWait, options.signal);
    try {
      return await work();
    } finally {
      if (holds) this.leave();
    }
  }

  private enter(onWait: ((position: number) => void) | undefined, signal: AbortSignal | undefined): Promise<boolean> {
    if (this.running < this.size) {
      this.running += 1;
      return Promise.resolve(true);
    }
    if (signal?.aborted) return Promise.resolve(false);
    const queuedAt = this.now();
    return new Promise<boolean>((resolve) => {
      const waiter: Waiter = {
        onWait,
        start: () => {
          signal?.removeEventListener('abort', cancel);
          this.running += 1;
          this.waits.push(this.now() - queuedAt);
          if (this.waits.length > WAIT_SAMPLES) this.waits.shift();
          resolve(true);
        },
      };
      const cancel = (): void => {
        this.remove(waiter);
        resolve(false);
      };
      this.waiting.push(waiter);
      signal?.addEventListener('abort', cancel, { once: true });
      onWait?.(this.waiting.length);
    });
  }

  private leave(): void {
    this.running -= 1;
    const next = this.waiting.shift();
    next?.start();
    if (next) this.announce();
  }

  private remove(waiter: Waiter): void {
    const index = this.waiting.indexOf(waiter);
    if (index < 0) return;
    this.waiting.splice(index, 1);
    this.announce();
  }

  private announce(): void {
    this.waiting.forEach((waiter, index) => waiter.onWait?.(index + 1));
  }
}
