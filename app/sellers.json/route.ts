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

function toValidSellersJson(raw: string): string {
  if (!raw) return '[]';
  try {
    const parsed = JSON.parse(raw);
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return '[]\n';
  }
}

export async function GET() {
  const settings = await readAdsFilesSettings();
  const content = settings.sellersJson || (await readFallbackFile('sellers.json'));

  return new Response(toValidSellersJson(content), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
