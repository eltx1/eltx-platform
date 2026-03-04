import 'server-only';

import { getDb } from './db.server';

export type GoogleTagSettings = {
  enabled: boolean;
  measurementId: string;
  customHeadScript: string;
};

const DEFAULT_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GTAG_ID || 'G-QXTV3S098V';

function parseEnabled(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

export async function getGoogleTagSettings(): Promise<GoogleTagSettings> {
  try {
    const db = getDb();
    const [rows] = await db.query(
      'SELECT name, value FROM platform_settings WHERE name IN (?, ?, ?)',
      ['analytics_google_tag_enabled', 'analytics_google_tag_id', 'analytics_google_tag_custom_head_script']
    );

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
    };
  } catch {
    return {
      enabled: true,
      measurementId: DEFAULT_MEASUREMENT_ID,
      customHeadScript: '',
    };
  }
}
