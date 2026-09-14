import type { ServerResponse } from 'node:http';

/** Server-Sent Events framing: `id`, `event`, one `data:` line per JSON line, blank line terminator. */
export function formatSse(event: string, data: unknown, id?: number): string {
  const json = JSON.stringify(data);
  const lines = [...(id === undefined ? [] : [`id: ${id}`]), `event: ${event}`, ...json.split('\n').map((l) => `data: ${l}`)];
  return `${lines.join('\n')}\n\n`;
}

export interface SseChannel {
  send(event: string, data: unknown): void;
  close(): void;
  readonly closed: boolean;
}

/** Starts an SSE response on a raw Node response (Caddy is configured not to buffer). */
export function openSse(raw: ServerResponse, options: { heartbeatMs?: number; onClose?: () => void } = {}): SseChannel {
  raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  raw.write(': connected\n\n');
  let closed = false;
  let seq = 0;
  const heartbeat = setInterval(() => {
    if (!closed) raw.write(': ping\n\n');
  }, options.heartbeatMs ?? 15_000);
  heartbeat.unref();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    raw.end();
    options.onClose?.();
  };
  raw.on('close', () => {
    if (!closed) {
      closed = true;
      clearInterval(heartbeat);
      options.onClose?.();
    }
  });

  return {
    send(event, data) {
      if (closed) return;
      seq += 1;
      raw.write(formatSse(event, data, seq));
    },
    close,
    get closed() {
      return closed;
    },
  };
}
