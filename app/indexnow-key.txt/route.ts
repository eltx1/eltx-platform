import { NextResponse } from 'next/server';
import { readSeoSettings } from '../lib/seo.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await readSeoSettings();
  return new NextResponse(settings.indexNowKey || '', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
