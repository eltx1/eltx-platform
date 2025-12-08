'use client';

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  status?: number;
  error?: string | null;
};
export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  const shouldBypassBase = path.startsWith('/api/') || /^https?:\/\//.test(path);
  const url = shouldBypassBase ? path : `${base}${path}`;
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
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status >= 500) console.error('API request failed', { url, status: res.status, body: data });
      return {
        ok: false,
        data: data as T,
        status: res.status,
        error: data?.error?.message || data?.message || res.statusText,
      };
    }
    return { ok: true, data: data as T, status: res.status, error: null };
  } catch (err) {
    console.error('API request failed', err);
    return { ok: false, data: null as T, status: 0, error: 'Network error' };
  }
}
