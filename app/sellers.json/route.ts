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

function toValidSellersJson(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return null;
  }
}

export async function GET() {
  const settings = await readAdsFilesSettings();
  const settingsContent = toValidSellersJson(settings.sellersJson);

  const content = settingsContent
    ?? toValidSellersJson(await readFallbackFile('sellers.json'))
    ?? '[]\n';

  return new Response(content, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
