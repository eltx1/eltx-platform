'use client';

const KEY = 'first_utm_payload_v1';
const MAX_LANDING_PATH_LENGTH = 191;

export type UtmPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  utm_landing_path?: string;
};

function readStoredPayload(): UtmPayload | null {
  const stored = window.localStorage.getItem(KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) || {};
  } catch {
    return null;
  }
}

function buildPayloadFromLocation(): UtmPayload {
  const params = new URLSearchParams(window.location.search || '');
  const pathname = window.location.pathname || undefined;

  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_term: params.get('utm_term') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_landing_path: pathname ? pathname.slice(0, MAX_LANDING_PATH_LENGTH) : undefined,
  };
}

function hasAnyUtmParam(payload: UtmPayload): boolean {
  return Boolean(payload.utm_source || payload.utm_medium || payload.utm_campaign || payload.utm_term || payload.utm_content);
}

export function captureFirstUtmFromLocation(): UtmPayload {
  if (typeof window === 'undefined') return {};

  const storedPayload = readStoredPayload();
  if (storedPayload) return storedPayload;

  const payload = buildPayloadFromLocation();
  if (!hasAnyUtmParam(payload)) return {};

  window.localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}

export function getOrStoreFirstUtm(): UtmPayload {
  if (typeof window === 'undefined') return {};

  const storedPayload = readStoredPayload();
  if (storedPayload) return storedPayload;

  return captureFirstUtmFromLocation();
}
