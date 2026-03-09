import { promises as fs } from 'fs';
import path from 'path';
import { readAdsFilesSettings } from '../lib/ads-files.server';

export const dynamic = 'force-dynamic';

async function readFallbackFile(fileName: string) {
  try {
    return (await fs.readFile(path.join(process.cwd(), fileName), 'utf8')).trim();
  } catch {
    return '';
  }
}

export async function GET() {
  const settings = await readAdsFilesSettings();
  const content = settings.appAdsTxt || (await readFallbackFile('app-ads.txt'));

  return new Response(content ? `${content}\n` : '', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
