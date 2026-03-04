'use client';

const KEY = 'first_utm_payload_v1';

export type UtmPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  utm_landing_path?: string;
};

export function getOrStoreFirstUtm(): UtmPayload {
  if (typeof window === 'undefined') return {};
  const stored = window.localStorage.getItem(KEY);
  if (stored) {
    try {
      return JSON.parse(stored) || {};
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(window.location.search || '');
  const payload: UtmPayload = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_term: params.get('utm_term') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_landing_path: window.location.pathname || undefined,
  };
  window.localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}
