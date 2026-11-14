import { describe, expect, it } from 'vitest';
import { Slots } from '../../src/lib/slots.js';

/** A job that runs until the test lets it finish. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('Slots (D-214)', () => {
  it('never runs more than its size at once, and starts the waiting in arrival order', async () => {
    const slots = new Slots(2, 10);
    const gates = [gate(), gate(), gate(), gate()];
    const started: number[] = [];
    const runs = gates.map((g, i) =>
      slots.run(async () => {
        started.push(i);
        await g.promise;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(slots.stats()).toMatchObject({ running: 2, waiting: 2 });

    gates[1]!.open();
    await runs[1];
    await tick();
    expect(started).toEqual([0, 1, 2]);
    expect(slots.stats()).toMatchObject({ running: 2, waiting: 1 });

    for (const g of gates) g.open();
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3]);
    expect(slots.stats()).toMatchObject({ running: 0, waiting: 0 });
  });

  it('tells each waiting job its place, again whenever the queue moves', async () => {
    const slots = new Slots(1, 10);
    const first = gate();
    const heard: Record<string, number[]> = { b: [], c: [] };
    const a = slots.run(() => first.promise);
    const b = slots.run(() => Promise.resolve(), { onWait: (p) => heard.b!.push(p) });
    const c = slots.run(() => Promise.resolve(), { onWait: (p) => heard.c!.push(p) });
    await tick();
    expect(heard).toEqual({ b: [1], c: [2] });
    first.open();
    await Promise.all([a, b, c]);
    // b started; c moved up to first in line before it started too.
    expect(heard.c).toEqual([2, 1]);
  });

  it('lets a job cancelled while waiting leave the queue and finish without taking a slot', async () => {
    const slots = new Slots(1, 10);
    const first = gate();
    const controller = new AbortController();
    const a = slots.run(() => first.promise);
    let ranCancelled = false;
    const b = slots.run(
      () => {
        ranCancelled = true;
        return Promise.resolve('cancelled');
      },
      { signal: controller.signal },
    );
    await tick();
    expect(slots.stats().waiting).toBe(1);
    controller.abort();
    expect(await b).toBe('cancelled');
    expect(ranCancelled).toBe(true);
    // The running job still owns the only slot: the cancelled one never took it.
    expect(slots.stats()).toMatchObject({ running: 1, waiting: 0 });
    first.open();
    await a;
    expect(slots.stats().running).toBe(0);
  });

  it('is full only when every slot is taken and the queue is at its limit', async () => {
    const slots = new Slots(1, 1);
    const first = gate();
    expect(slots.full).toBe(false);
    const a = slots.run(() => first.promise);
    expect(slots.full).toBe(false);
    const b = slots.run(() => Promise.resolve());
    await tick();
    expect(slots.full).toBe(true);
    first.open();
    await Promise.all([a, b]);
    expect(slots.full).toBe(false);
  });

  it('frees the slot when the job throws, and records how long the waiting waited', async () => {
    let now = 0;
    const slots = new Slots(1, 5, () => now);
    const first = gate();
    const a = slots.run(async () => {
      await first.promise;
      throw new Error('boom');
    });
    const b = slots.run(() => Promise.resolve('ok'));
    await tick();
    now = 4_000;
    first.open();
    await expect(a).rejects.toThrow('boom');
    expect(await b).toBe('ok');
    expect(slots.stats()).toMatchObject({ running: 0, waiting: 0, waitsMs: [4_000] });
  });
});
