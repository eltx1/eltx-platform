import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getDb } from './db.server';

const DB_SETTING_NAME = 'seo_settings_json';
const filePath = path.join(process.cwd(), 'data', 'seo-settings.json');

export type SeoSettings = {
  sitemapRefreshHours: number;
  indexNowEnabled: boolean;
  indexNowKey: string;
  indexNowKeyLocation: string;
  includeRssInSitemap: boolean;
};

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  sitemapRefreshHours: 3,
  indexNowEnabled: false,
  indexNowKey: '',
  indexNowKeyLocation: '/indexnow-key.txt',
  includeRssInSitemap: true,
};

type SettingRow = RowDataPacket & { value: string };
type PostRow = RowDataPacket & { id: number; updated_at: string | null; created_at: string };

export function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://lordai.net').replace(/\/$/, '');
}

export function normalizeSeoSettings(input: Partial<SeoSettings> | null | undefined): SeoSettings {
  const refresh = Number(input?.sitemapRefreshHours);
  return {
    sitemapRefreshHours: Number.isFinite(refresh) ? Math.min(24, Math.max(1, Math.round(refresh))) : DEFAULT_SEO_SETTINGS.sitemapRefreshHours,
    indexNowEnabled: Boolean(input?.indexNowEnabled),
    indexNowKey: String(input?.indexNowKey || '').trim(),
    indexNowKeyLocation: '/indexnow-key.txt',
    includeRssInSitemap: input?.includeRssInSitemap !== false,
  };
}

function createIndexNowKey() {
  return randomBytes(16).toString('hex');
}

async function readFromDb(): Promise<SeoSettings | null> {
  const db = getDb();
  const [rows] = await db.query<SettingRow[]>('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [DB_SETTING_NAME]);
  const value = rows[0]?.value;
  if (!value) return null;
  return normalizeSeoSettings(JSON.parse(value));
}

async function readFromFile(): Promise<SeoSettings | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeSeoSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeToFile(settings: SeoSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

export async function readSeoSettings(): Promise<SeoSettings> {
  try {
    const fromDb = await readFromDb();
    if (fromDb) {
      await writeToFile(fromDb);
      return fromDb;
    }
  } catch {
    // fallback to file
  }
  const fromFile = await readFromFile();
  return fromFile || DEFAULT_SEO_SETTINGS;
}

export async function writeSeoSettings(input: Partial<SeoSettings> | null | undefined): Promise<SeoSettings> {
  const settings = normalizeSeoSettings(input);
  if (settings.indexNowEnabled && !settings.indexNowKey) {
    settings.indexNowKey = createIndexNowKey();
  }
  settings.indexNowKeyLocation = '/indexnow-key.txt';
  try {
    const db = getDb();
    await db.query<ResultSetHeader>(
      `INSERT INTO platform_settings (name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [DB_SETTING_NAME, JSON.stringify(settings)],
    );
  } catch {
    // keep file fallback
  }
  await writeToFile(settings);
  return settings;
}

export async function loadPublicSitemapPosts(limit = 1000) {
  try {
    const db = getDb();
    const [rows] = await db.query<PostRow[]>(
      `SELECT id, created_at, updated_at
         FROM social_posts
     ORDER BY created_at DESC
        LIMIT ?`,
      [limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      lastmod: new Date(row.updated_at || row.created_at).toISOString(),
    }));
  } catch {
    return [] as Array<{ id: string; lastmod: string }>;
  }
}

export async function countPublicSitemapPosts() {
  try {
    const db = getDb();
    const [rows] = await db.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM social_posts`,
    );
    return Number(rows[0]?.total || 0);
  } catch {
    return 0;
  }
}

export async function loadPublicSitemapPostsPage(page: number, pageSize: number) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(50000, Math.max(1, Math.floor(pageSize))) : 1000;
  const offset = (safePage - 1) * safePageSize;

  try {
    const db = getDb();
    const [rows] = await db.query<PostRow[]>(
      `SELECT id, created_at, updated_at
         FROM social_posts
     ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [safePageSize, offset],
    );
    return rows.map((row) => ({
      id: String(row.id),
      lastmod: new Date(row.updated_at || row.created_at).toISOString(),
    }));
  } catch {
    return [] as Array<{ id: string; lastmod: string }>;
  }
}

export async function notifySearchEnginesForPost(postUrl: string): Promise<{ sent: boolean; details: string[] }> {
  const settings = await readSeoSettings();
  const details: string[] = [];
  if (!settings.indexNowEnabled || !settings.indexNowKey) {
    return { sent: false, details: ['IndexNow disabled'] };
  }

  const base = getBaseUrl();
  const keyLocation = `${base}${settings.indexNowKeyLocation || '/indexnow-key.txt'}`;
  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(base).host,
        key: settings.indexNowKey,
        keyLocation,
        urlList: [postUrl],
      }),
      cache: 'no-store',
    });
    details.push(`IndexNow status ${response.status}`);
    return { sent: response.ok, details };
  } catch (error) {
    details.push(`IndexNow error: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { sent: false, details };
  }
}
