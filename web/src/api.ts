import type { ChatEvent } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CONNECTION_ERROR = 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.';

async function failure(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new ApiError(res.status, body?.error?.message ?? 'İstek tamamlanamadı, tekrar dene.');
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = init.body ? { 'content-type': 'application/json' } : undefined;
  const res = await fetch(`/api/v1${path}`, { headers, ...init }).catch(() => {
    throw new ApiError(0, CONNECTION_ERROR);
  });
  if (!res.ok) throw await failure(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** A multipart upload: the browser sets the boundary, so no content-type of our own. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { method: 'POST', body: form }).catch(() => {
    throw new ApiError(0, CONNECTION_ERROR);
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export const post = <T>(path: string, body: unknown = {}): Promise<T> => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown): Promise<T> => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown): Promise<T> => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });

/** Splits an SSE byte stream into its JSON payloads; `rest` is the unfinished frame to prepend to the next chunk. */
export function parseFrames(buffer: string): { events: unknown[]; rest: string } {
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';
  const events = frames.flatMap((frame) => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
      .join('\n');
    return data ? [JSON.parse(data) as unknown] : [];
  });
  return { events, rest };
}

/** The answer to a message arrives as a stream on the POST itself, which EventSource cannot do. */
export async function sendMessage(form: FormData, onEvent: (event: ChatEvent) => void): Promise<void> {
  const res = await fetch('/api/v1/chat/messages', { method: 'POST', body: form }).catch(() => {
    throw new ApiError(0, CONNECTION_ERROR);
  });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const { events, rest } = parseFrames(buffer + value);
    buffer = rest;
    for (const event of events) onEvent(event as ChatEvent);
  }
}
