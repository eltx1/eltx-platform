import { NextResponse } from 'next/server';
import { getBaseUrl, loadPublicSitemapPosts } from '../lib/seo.server';

export const dynamic = 'force-dynamic';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const baseUrl = getBaseUrl();
  const posts = await loadPublicSitemapPosts(100);

  const items = posts
    .map((post) => {
      const url = `${baseUrl}/posts/${encodeURIComponent(post.id)}`;
      return `<item><title>Post ${escapeXml(post.id)}</title><link>${escapeXml(url)}</link><guid>${escapeXml(url)}</guid><pubDate>${new Date(post.lastmod).toUTCString()}</pubDate></item>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>LordAi.Net Public Posts</title><link>${escapeXml(baseUrl)}</link><description>Latest public posts feed for search discovery.</description>${items}</channel></rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
