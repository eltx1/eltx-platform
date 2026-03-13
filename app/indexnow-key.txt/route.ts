import { NextResponse } from 'next/server';
import { readSeoSettings } from '../lib/seo.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await readSeoSettings();
  if (!settings.indexNowEnabled || !settings.indexNowKey) {
    return new NextResponse('IndexNow is not enabled.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new NextResponse(`${settings.indexNowKey}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
