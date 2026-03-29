import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from './db.server';
import { DEFAULT_PAGE_AD_SETTINGS, normalizePageAdSettings, type PageAdSettings } from './page-ads';

const filePath = path.join(process.cwd(), 'data', 'page-ads-settings.json');
const injectFilePath = path.join(process.cwd(), 'data', 'page-ads-inject-settings.json');
const DB_SETTING_NAME = 'page_ads_settings_json';
const DB_INJECT_SETTING_NAME = 'page_ads_inject_settings_json';

async function readFromFile(): Promise<PageAdSettings | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizePageAdSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readInjectFromFile(): Promise<PageAdSettings | null> {
  try {
    const raw = await fs.readFile(injectFilePath, 'utf8');
    return normalizePageAdSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readFromDb(): Promise<PageAdSettings | null> {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [DB_SETTING_NAME]);
    const row = (rows as Array<{ value?: string }>)[0];
    if (!row?.value) return null;
    return normalizePageAdSettings(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function readInjectFromDb(): Promise<PageAdSettings | null> {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [DB_INJECT_SETTING_NAME]);
    const row = (rows as Array<{ value?: string }>)[0];
    if (!row?.value) return null;
    return normalizePageAdSettings(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function writeToFile(settings: PageAdSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
}

async function writeInjectToFile(settings: PageAdSettings) {
  await fs.mkdir(path.dirname(injectFilePath), { recursive: true });
  await fs.writeFile(injectFilePath, JSON.stringify(settings, null, 2), 'utf8');
}

async function writeToDb(settings: PageAdSettings) {
  const db = getDb();
  await db.query(
    `INSERT INTO platform_settings (name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [DB_SETTING_NAME, JSON.stringify(settings)],
  );
}

async function writeInjectToDb(settings: PageAdSettings) {
  const db = getDb();
  await db.query(
    `INSERT INTO platform_settings (name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [DB_INJECT_SETTING_NAME, JSON.stringify(settings)],
  );
}

export async function readPageAdSettings() {
  return (await readFromDb()) || (await readFromFile()) || DEFAULT_PAGE_AD_SETTINGS;
}

export async function writePageAdSettings(input: unknown) {
  const settings = normalizePageAdSettings(input);
  try {
    await writeToDb(settings);
  } catch {
    // Fallback to file-only mode.
  }
  await writeToFile(settings);
  return settings;
}

export async function readPageAdInjectSettings() {
  return (await readInjectFromDb()) || (await readInjectFromFile()) || DEFAULT_PAGE_AD_SETTINGS;
}

export async function writePageAdInjectSettings(input: unknown) {
  const settings = normalizePageAdSettings(input);
  try {
    await writeInjectToDb(settings);
  } catch {
    // Fallback to file-only mode.
  }
  await writeInjectToFile(settings);
  return settings;
}
