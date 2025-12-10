'use client';

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  status?: number;
  error?: string | null;
};
function normalizeBase(base: string | undefined) {
  if (!base) return '';
  return base.replace(/\/+$/, '');
}

function normalizePath(path: string) {
  if (!path.startsWith('/')) return `/${path}`;
  return path;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const base = normalizeBase(process.env.NEXT_PUBLIC_API_BASE);
  const isAbsolute = /^https?:\/\//.test(path);
  const normalizedPath = isAbsolute ? path : normalizePath(path);
  const shouldBypassBase = isAbsolute || normalizedPath.startsWith('/api/');
  const url = shouldBypassBase ? normalizedPath : `${base}${normalizedPath}`;
  try {
    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const raw = await res.text();
    let data: any = null;
    let parseError: string | null = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        parseError = 'Invalid response from server';
        console.error('API response was not valid JSON', {
          url,
          status: res.status,
          preview: raw.slice(0, 200),
          error: (err as Error)?.message || err,
        });
      }
    }

    if (!res.ok || parseError || data === null) {
      if (res.status >= 500) console.error('API request failed', { url, status: res.status, body: data ?? raw });
      const message =
        data?.error?.message ||
        data?.message ||
        parseError ||
        (res.statusText || 'Request failed' || '');
      return {
        ok: false,
        data: data as T,
        status: res.status,
        error: message,
      };
    }

    return { ok: true, data: data as T, status: res.status, error: null };
  } catch (err) {
    console.error('API request failed', err);
    return { ok: false, data: null as T, status: 0, error: 'Network error' };
  }
}
