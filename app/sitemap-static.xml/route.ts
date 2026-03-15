import { NextResponse } from 'next/server';
import { buildBaseSitemapEntries, renderSitemapXml } from '../lib/sitemap-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const entries = await buildBaseSitemapEntries();
  const xml = renderSitemapXml(entries);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
