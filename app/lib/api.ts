'use client';

import { getApiBaseForBrowser } from './api-base';

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  status?: number;
  error?: string | null;
};

function isHtmlPayload(value: string) {
  const sample = value.trim().slice(0, 256).toLowerCase();
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<body');
}

function fallbackMessageByStatus(status: number) {
  if (status === 503) return 'Service temporarily unavailable. Please try again in a few minutes.';
  if (status >= 500) return 'Server error. Please try again shortly.';
  return 'Request failed';
}

function normalizeErrorMessage(value: unknown, status: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isHtmlPayload(trimmed)) return fallbackMessageByStatus(status);
  const noTags = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!noTags) return fallbackMessageByStatus(status);
  return noTags.slice(0, 240);
}

function normalizePath(path: string) {
  if (!path.startsWith('/')) return `/${path}`;
  return path;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const base = getApiBaseForBrowser();
  const isAbsolute = /^https?:\/\//.test(path);
  const normalizedPath = isAbsolute ? path : normalizePath(path);
  const shouldBypassBase = isAbsolute || normalizedPath.startsWith('/api/');
  const url = shouldBypassBase ? normalizedPath : `${base}${normalizedPath}`;
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const defaultHeaders = isFormDataBody ? {} : { 'Content-Type': 'application/json' };
  try {
    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();
    let data: any = null;
    let parseError: string | null = null;

    if (raw) {
      const isJson = contentType.includes('application/json');
      try {
        data = isJson ? JSON.parse(raw) : raw;
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

    const expectsJson = contentType.includes('application/json');
    const failedToParseJson = expectsJson && parseError;
    const missingExpectedData = expectsJson && data === null;

    if (!res.ok || failedToParseJson || missingExpectedData) {
      if (res.status >= 500) console.error('API request failed', { url, status: res.status, body: data ?? raw });
      const message =
        data?.error?.message ||
        data?.message ||
        normalizeErrorMessage(data, res.status) ||
        parseError ||
        (res.statusText || fallbackMessageByStatus(res.status));
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
