'use client';

export type AnalyticsEventKey = 'signup' | 'login' | 'kyc_submit' | 'trade_buy';

type AnalyticsRuntimeSettings = {
  enabled: boolean;
  measurementId: string;
  consentModeEnabled: boolean;
  eventCatalog: Record<AnalyticsEventKey, boolean>;
  adsConversion: {
    preset: string;
    conversionId: string;
    labels: Partial<Record<AnalyticsEventKey, string>>;
  };
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
    __analyticsSettings?: AnalyticsRuntimeSettings;
  }
}

export const CONSENT_KEY = 'analytics_consent_v1';

export function getAnalyticsSettings(): AnalyticsRuntimeSettings | null {
  if (typeof window === 'undefined') return null;
  return window.__analyticsSettings || null;
}

export function getConsentState(): 'granted' | 'denied' | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(CONSENT_KEY);
  if (raw === 'granted' || raw === 'denied') return raw;
  return null;
}

export function setConsentState(value: 'granted' | 'denied') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, value);
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value,
    });
  }
}

export function trackEvent(event: AnalyticsEventKey, params: Record<string, any> = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const settings = getAnalyticsSettings();
  if (!settings?.enabled) return;
  if (!settings.eventCatalog?.[event]) return;
  if (settings.consentModeEnabled && getConsentState() !== 'granted') return;

  window.gtag('event', event, params);

  const conversionId = settings.adsConversion?.conversionId?.trim();
  const label = settings.adsConversion?.labels?.[event]?.trim();
  if (conversionId && label) {
    window.gtag('event', 'conversion', {
      send_to: `${conversionId}/${label}`,
      event_callback: params.event_callback,
    });
  }
}
