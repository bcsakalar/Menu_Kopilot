/**
 * In-memory registry of active runs: abort controllers (cancel) and an event log that late subscribers replay
 * (SSE reconnects). Runs keep going when the client disconnects; finished runs are forgotten after a while and
 * are then served from the database snapshot.
 */

export interface RunEvent {
  type: string;
}

interface RunState<E extends RunEvent> {
  controller: AbortController;
  events: E[];
  listeners: Set<(event: E) => void>;
  done: boolean;
}

const TERMINAL = new Set(['done', 'error']);

export class RunRegistry<E extends RunEvent> {
  private readonly runs = new Map<string, RunState<E>>();

  constructor(private readonly retainMs = 10 * 60_000) {}

  create(runId: string): AbortController {
    const controller = new AbortController();
    this.runs.set(runId, { controller, events: [], listeners: new Set(), done: false });
    return controller;
  }

  emit(runId: string, event: E): void {
    const state = this.runs.get(runId);
    if (!state) return;
    state.events.push(event);
    for (const listener of state.listeners) listener(event);
    if (TERMINAL.has(event.type)) this.finish(runId);
  }

  /** Replays past events, then streams live ones. Returns an unsubscribe function, or undefined if unknown. */
  subscribe(runId: string, listener: (event: E) => void): (() => void) | undefined {
    const state = this.runs.get(runId);
    if (!state) return undefined;
    for (const event of state.events) listener(event);
    if (state.done) return () => undefined;
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }

  cancel(runId: string): boolean {
    const state = this.runs.get(runId);
    if (!state || state.done) return false;
    state.controller.abort(new Error('cancelled by user'));
    return true;
  }

  isActive(runId: string): boolean {
    const state = this.runs.get(runId);
    return state !== undefined && !state.done;
  }

  /** Still in memory (running or recently finished) → events can be replayed. */
  has(runId: string): boolean {
    return this.runs.has(runId);
  }

  private finish(runId: string): void {
    const state = this.runs.get(runId);
    if (!state || state.done) return;
    state.done = true;
    state.listeners.clear();
    const timer = setTimeout(() => {
      if (this.runs.get(runId) === state) this.runs.delete(runId);
    }, this.retainMs);
    timer.unref();
  }
}
