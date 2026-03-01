import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '../../../lib/db.server';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, normalizeFeedAlgorithmSettings, type FeedAlgorithmSettings } from '../../../lib/feed-algorithm';

const filePath = path.join(process.cwd(), 'data', 'feed-algorithm-settings.json');

const SETTINGS_MAP: Record<keyof FeedAlgorithmSettings, string> = {
  followingRatio: 'social_feed_following_ratio',
  forYouRatio: 'social_feed_for_you_ratio',
  likeWeight: 'social_feed_like_weight',
  commentWeight: 'social_feed_comment_weight',
  repostWeight: 'social_feed_repost_weight',
  viewWeight: 'social_feed_view_weight',
  trustWeight: 'social_feed_trust_weight',
  threadBoostWeight: 'social_feed_thread_boost_weight',
  maxFeedItems: 'social_feed_max_items',
};

async function readFromFile(): Promise<FeedAlgorithmSettings> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FeedAlgorithmSettings>;
    return normalizeFeedAlgorithmSettings(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_FEED_ALGORITHM_SETTINGS;
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
    const keys = Object.values(SETTINGS_MAP);
    const [rows] = await db.query('SELECT name, value FROM platform_settings WHERE name IN (?)', [keys]) as any[];
    const values = new Map<string, string>();
    (rows || []).forEach((row: { name: string; value: string }) => values.set(row.name, row.value));

    const parsed: Partial<FeedAlgorithmSettings> = {};
    (Object.keys(SETTINGS_MAP) as Array<keyof FeedAlgorithmSettings>).forEach((key) => {
      const dbName = SETTINGS_MAP[key];
      const rawValue = values.get(dbName);
      if (rawValue != null && rawValue !== '') {
        const asNumber = Number(rawValue);
        if (Number.isFinite(asNumber)) {
          parsed[key] = asNumber;
        }
      }
    });

    return normalizeFeedAlgorithmSettings(parsed);
  } catch {
    return null;
  }
}

async function writeToDb(settings: FeedAlgorithmSettings): Promise<boolean> {
  try {
    const db = getDb();
    const entries = (Object.keys(SETTINGS_MAP) as Array<keyof FeedAlgorithmSettings>).map((key) => [
      SETTINGS_MAP[key],
      String(settings[key]),
    ]);

    await db.query(
      'INSERT INTO platform_settings (name, value) VALUES ? ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [entries],
    );

    return true;
  } catch {
    return false;
  }
}

async function readSettings(): Promise<{ settings: FeedAlgorithmSettings; source: 'db' | 'file' }> {
  const fromDb = await readFromDb();
  if (fromDb) return { settings: fromDb, source: 'db' };
  return { settings: await readFromFile(), source: 'file' };
}

export async function GET() {
  const { settings, source } = await readSettings();
  return NextResponse.json({ settings, source });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const settings = normalizeFeedAlgorithmSettings(body?.settings || body);
  const savedToDb = await writeToDb(settings);
  if (!savedToDb) {
    await writeToFile(settings);
  }
  return NextResponse.json({ settings, source: savedToDb ? 'db' : 'file' });
}
