'use client';

/**
 * Browser API client. Sessions live in httpOnly cookies set by the API; this client only keeps
 * the CSRF token in memory, refreshes the access token once on 401, and routes to /login or
 * /setup-mfa when the session requires it.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(detail ?? title);
  }
}

let csrfToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

async function csrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const r = await fetch(`${API_URL}/api/v1/auth/csrf`, { credentials: 'include' });
  csrfToken = ((await r.json()) as { csrfToken: string }).csrfToken;
  return csrfToken;
}

async function refresh(): Promise<boolean> {
  // One refresh at a time across the tab (concurrent refreshes would trip reuse detection).
  refreshing ??= (async () => {
    try {
      const r = await raw('POST', '/api/v1/auth/refresh');
      return r.ok;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function raw(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = { ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await csrf();
  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const NO_REFRESH = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/mfa/verify', '/api/v1/auth/logout'];

export async function api<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res = await raw(method, path, body, headers);
  if (res.status === 401 && !NO_REFRESH.includes(path) && (await refresh())) res = await raw(method, path, body, headers);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 403 && data.detail === 'mfa_setup_required' && typeof window !== 'undefined' && !location.pathname.startsWith('/setup-mfa')) {
      location.assign('/setup-mfa/');
    }
    if (res.status === 403 && data.detail === 'csrf token missing or invalid') csrfToken = null;
    throw new ApiError(res.status, String(data.title ?? res.statusText), data.detail as string | undefined, data);
  }
  return data as T;
}

export const get = <T>(p: string) => api<T>('GET', p);
export const post = <T>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const put = <T>(p: string, b: unknown = {}) => api<T>('PUT', p, b);
export const patch = <T>(p: string, b: unknown = {}) => api<T>('PATCH', p, b);
export const del = <T>(p: string) => api<T>('DELETE', p);

/** Binary GET (e.g. proctoring snapshots) returned as an object URL (CSP allows blob: images). */
export async function getBlobUrl(path: string): Promise<string> {
  let res = await raw('GET', path);
  if (res.status === 401 && (await refresh())) res = await raw('GET', path);
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return URL.createObjectURL(await res.blob());
}

/** Make sure the access cookie is fresh (used before opening a WebSocket). */
export async function ensureSession(): Promise<boolean> {
  try {
    await get('/api/v1/auth/me');
    return true;
  } catch {
    return false;
  }
}

export const WS_URL = `${API_URL.replace(/^http/, 'ws')}/api/v1/ws`;

/**
 * Push channel (WebSocket) with automatic reconnect. Auth is the session cookie; the server
 * closes with 4001 when the access token expires, so we refresh and reconnect. Every message
 * is a hint: callers re-read state over HTTP, and also poll, so a lost socket loses nothing.
 */
export function openRealtime(subscribe: Record<string, unknown>, onMessage: (m: Record<string, unknown>) => void): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const connect = async () => {
    if (stopped) return;
    await ensureSession();
    if (stopped) return;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      timer = setTimeout(() => void connect(), delay);
      return;
    }
    ws.onopen = () => {
      delay = 1000;
      ws?.send(JSON.stringify({ op: 'sub', ...subscribe }));
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (stopped) return;
      delay = Math.min(delay * 2, 15_000);
      timer = setTimeout(() => void connect(), delay);
    };
  };
  void connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}

/** Subscribe to submission updates via SSE; falls back to polling if EventSource fails. */
export function watchSubmission<T extends { status: string }>(id: string, onUpdate: (s: T) => void): () => void {
  let stopped = false;
  let es: EventSource | null = null;
  let poll: ReturnType<typeof setTimeout> | null = null;
  const done = (s: T) => s.status === 'done' || s.status === 'failed';
  const startPolling = () => {
    const tick = async () => {
      if (stopped) return;
      try {
        const s = await get<T>(`/api/v1/submissions/${id}`);
        onUpdate(s);
        if (done(s)) return;
      } catch {
        /* retry */
      }
      poll = setTimeout(tick, 400);
    };
    void tick();
  };
  try {
    es = new EventSource(`${API_URL}/api/v1/submissions/${id}/events`, { withCredentials: true });
    es.addEventListener('submission', (e) => {
      const s = JSON.parse((e as MessageEvent).data) as T;
      onUpdate(s);
      if (done(s)) es?.close();
    });
    es.onerror = () => {
      es?.close();
      if (!stopped) startPolling();
    };
  } catch {
    startPolling();
  }
  return () => {
    stopped = true;
    es?.close();
    if (poll) clearTimeout(poll);
  };
}
