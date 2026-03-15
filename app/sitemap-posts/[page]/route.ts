import { NextRequest, NextResponse } from 'next/server';
import { buildPostSitemapEntries, renderSitemapXml } from '../../lib/sitemap-utils';

export const dynamic = 'force-dynamic';

function parsePage(value: string) {
  const page = Number(value);
  return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
}

export async function GET(_request: NextRequest, context: { params: { page: string } }) {
  const page = parsePage(context.params.page);
  const entries = await buildPostSitemapEntries(page);

  const xml = renderSitemapXml(entries);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
