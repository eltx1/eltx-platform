'use client';

interface ApiError {
  status: number;
  code?: string;
  message?: string;
  [key: string]: any;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) throw new Error('NEXT_PUBLIC_API_BASE is not defined');
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      credentials: 'include',
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
        error: {
          status: res.status,
          ...(data?.error || {}),
          message: data?.error?.message || data?.message || res.statusText,
        },
      };
    }
    return { data };
  } catch (err) {
    console.error('API request failed', err);
    return { error: { status: 0, message: 'Network error' } };
  }
}
