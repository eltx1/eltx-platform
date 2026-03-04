import 'server-only';

import { getDb } from './db.server';

export type GoogleTagSettings = {
  enabled: boolean;
  measurementId: string;
  customHeadScript: string;
  consentModeEnabled: boolean;
  eventCatalog: Record<'signup' | 'login' | 'kyc_submit' | 'trade_buy', boolean>;
  adsConversion: {
    preset: string;
    conversionId: string;
    labels: Partial<Record<'signup' | 'login' | 'kyc_submit' | 'trade_buy', string>>;
  };
};

const DEFAULT_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GTAG_ID || 'G-QXTV3S098V';
const DEFAULT_EVENT_CATALOG = { signup: true, login: true, kyc_submit: true, trade_buy: true };

function parseEnabled(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

function parseEventCatalog(raw: string | undefined) {
  if (!raw) return DEFAULT_EVENT_CATALOG;
  try {
    const parsed = JSON.parse(raw);
    return {
      signup: parsed?.signup !== false,
      login: parsed?.login !== false,
      kyc_submit: parsed?.kyc_submit !== false,
      trade_buy: parsed?.trade_buy !== false,
    };
  } catch {
    return DEFAULT_EVENT_CATALOG;
  }
}

export async function getGoogleTagSettings(): Promise<GoogleTagSettings> {
  try {
    const db = getDb();
    const keys = [
      'analytics_google_tag_enabled',
      'analytics_google_tag_id',
      'analytics_google_tag_custom_head_script',
      'analytics_event_catalog',
      'analytics_consent_mode_enabled',
      'analytics_ads_conversion_preset',
      'analytics_ads_conversion_id',
      'analytics_ads_label_signup',
      'analytics_ads_label_login',
      'analytics_ads_label_kyc_submit',
      'analytics_ads_label_trade_buy',
    ];
    const [rows] = await db.query(`SELECT name, value FROM platform_settings WHERE name IN (${keys.map(() => '?').join(',')})`, keys);

    const settingsMap = new Map<string, string>();
    for (const row of rows as Array<{ name: string; value: string | null }>) {
      if (row?.name) settingsMap.set(row.name, row.value?.toString() || '');
    }

    return {
      enabled: settingsMap.has('analytics_google_tag_enabled')
        ? parseEnabled(settingsMap.get('analytics_google_tag_enabled'))
        : true,
      measurementId: settingsMap.get('analytics_google_tag_id') || DEFAULT_MEASUREMENT_ID,
      customHeadScript: settingsMap.get('analytics_google_tag_custom_head_script') || '',
      consentModeEnabled: parseEnabled(settingsMap.get('analytics_consent_mode_enabled') || '0'),
      eventCatalog: parseEventCatalog(settingsMap.get('analytics_event_catalog')),
      adsConversion: {
        preset: settingsMap.get('analytics_ads_conversion_preset') || 'none',
        conversionId: settingsMap.get('analytics_ads_conversion_id') || '',
        labels: {
          signup: settingsMap.get('analytics_ads_label_signup') || '',
          login: settingsMap.get('analytics_ads_label_login') || '',
          kyc_submit: settingsMap.get('analytics_ads_label_kyc_submit') || '',
          trade_buy: settingsMap.get('analytics_ads_label_trade_buy') || '',
        },
      },
    };
  } catch {
    return {
      enabled: true,
      measurementId: DEFAULT_MEASUREMENT_ID,
      customHeadScript: '',
      consentModeEnabled: false,
      eventCatalog: DEFAULT_EVENT_CATALOG,
      adsConversion: { preset: 'none', conversionId: '', labels: {} },
    };
  }
}
