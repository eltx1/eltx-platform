import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, normalizeFeedAlgorithmSettings, type FeedAlgorithmSettings } from '../../../lib/feed-algorithm';

const filePath = path.join(process.cwd(), 'data', 'feed-algorithm-settings.json');

async function readSettings(): Promise<FeedAlgorithmSettings> {
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

async function writeSettings(settings: FeedAlgorithmSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
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
