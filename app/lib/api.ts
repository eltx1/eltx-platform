'use client';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) throw new Error('NEXT_PUBLIC_API_BASE is not defined');
  const url = `${base}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: text } };
    }
    const requestId = res.headers.get('x-request-id') || undefined;
    console.error('API request failed', { url, status: res.status, body: data, requestId });
    throw { status: res.status, ...data };
  }
  return res.json();
}
