import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, normalizeFeedAlgorithmSettings, type FeedAlgorithmSettings } from '../../../lib/feed-algorithm';
import { getDb } from '../../../lib/db.server';

const filePath = path.join(process.cwd(), 'data', 'feed-algorithm-settings.json');
const DB_SETTING_NAME = 'feed_algorithm_settings_json';

async function readFromFile(): Promise<FeedAlgorithmSettings | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FeedAlgorithmSettings>;
    return normalizeFeedAlgorithmSettings(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeToFile(settings: FeedAlgorithmSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

async function readFromDb(): Promise<FeedAlgorithmSettings | null> {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [DB_SETTING_NAME]);
    const row = (rows as Array<{ value?: unknown }>)[0];
    if (!row?.value || typeof row.value !== 'string') {
      return null;
    }
    const parsed = JSON.parse(row.value) as Partial<FeedAlgorithmSettings>;
    return normalizeFeedAlgorithmSettings(parsed);
  } catch {
    return null;
  }
}

async function writeToDb(settings: FeedAlgorithmSettings) {
  const db = getDb();
  await db.query(
    `INSERT INTO platform_settings (name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [DB_SETTING_NAME, JSON.stringify(settings)]
  );
}

async function readSettings(): Promise<FeedAlgorithmSettings> {
  const dbSettings = await readFromDb();
  if (dbSettings) return dbSettings;

  const fileSettings = await readFromFile();
  if (fileSettings) return fileSettings;

  return DEFAULT_FEED_ALGORITHM_SETTINGS;
}

async function writeSettings(settings: FeedAlgorithmSettings) {
  try {
    await writeToDb(settings);
    await writeToFile(settings);
    return;
  } catch {
    await writeToFile(settings);
  }
}

export async function GET() {
  const settings = await readSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const settings = normalizeFeedAlgorithmSettings(body?.settings || body);
  await writeSettings(settings);
  return NextResponse.json({ settings });
}
