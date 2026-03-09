import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from './db.server';

export type AdsFilesSettings = {
  adsTxt: string;
  appAdsTxt: string;
  sellersJson: string;
};

const filePath = path.join(process.cwd(), 'data', 'ads-files.json');
const DB_SETTING_NAME = 'ads_files_settings_json';

const defaults: AdsFilesSettings = {
  adsTxt: '',
  appAdsTxt: '',
  sellersJson: '',
};

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim();
}

function normalize(input: Partial<AdsFilesSettings> | null | undefined): AdsFilesSettings {
  return {
    adsTxt: normalizeText(input?.adsTxt),
    appAdsTxt: normalizeText(input?.appAdsTxt),
    sellersJson: normalizeText(input?.sellersJson),
  };
}

async function readFromFile(): Promise<AdsFilesSettings | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeToFile(settings: AdsFilesSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

async function readFromDb(): Promise<AdsFilesSettings | null> {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [DB_SETTING_NAME]);
    const row = (rows as Array<{ value?: unknown }>)[0];
    if (!row?.value || typeof row.value !== 'string') return null;
    return normalize(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function writeToDb(settings: AdsFilesSettings) {
  const db = getDb();
  await db.query(
    `INSERT INTO platform_settings (name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [DB_SETTING_NAME, JSON.stringify(settings)],
  );
}

export async function readAdsFilesSettings(): Promise<AdsFilesSettings> {
  return (await readFromDb()) || (await readFromFile()) || defaults;
}

export async function writeAdsFilesSettings(input: Partial<AdsFilesSettings> | null | undefined): Promise<AdsFilesSettings> {
  const settings = normalize(input);

  let wroteToDb = false;

  try {
    await writeToDb(settings);
    wroteToDb = true;
  } catch {
    // Fallback to file mode when DB is unavailable.
  }

  if (wroteToDb) {
    try {
      await writeToFile(settings);
    } catch {
      // Ignore file write failures when DB persistence already succeeded.
    }
    return settings;
  }

  await writeToFile(settings);
  return settings;
}
