import { getBaseUrl, loadPublicSitemapPosts, readSeoSettings } from './seo.server';

export type SitemapEntry = {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  alternates: Array<{
    hreflang: 'en' | 'ar' | 'x-default';
    href: string;
  }>;
};

const staticRoutes: Array<{ path: string; priority: number }> = [
  { path: '', priority: 1 },
  { path: '/login', priority: 0.8 },
  { path: '/signup', priority: 0.8 },
  { path: '/privacy', priority: 0.5 },
  { path: '/terms', priority: 0.5 },
  { path: '/contact', priority: 0.6 },
  { path: '/faq', priority: 0.7 },
  { path: '/child-safety', priority: 0.6 },
  { path: '/status', priority: 0.6 },
  { path: '/for-you', priority: 0.9 },
];

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeLastmod(value: string | Date) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function withLangParam(url: string, lang: 'en' | 'ar') {
  const parsed = new URL(url);
  parsed.searchParams.set('lang', lang);
  return parsed.toString();
}

function buildAlternates(loc: string): SitemapEntry['alternates'] {
  return [
    { hreflang: 'en', href: withLangParam(loc, 'en') },
    { hreflang: 'ar', href: withLangParam(loc, 'ar') },
    { hreflang: 'x-default', href: loc },
  ];
}

export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getBaseUrl();
  const settings = await readSeoSettings();
  const posts = await loadPublicSitemapPosts(5000);
  const changefreq: SitemapEntry['changefreq'] = settings.sitemapRefreshHours <= 6 ? 'hourly' : 'daily';

  const entries = new Map<string, SitemapEntry>();
  const now = new Date().toISOString();

  staticRoutes.forEach((route) => {
    const loc = `${baseUrl}${route.path}`;
    entries.set(loc, {
      loc,
      lastmod: now,
      changefreq,
      priority: route.priority,
      alternates: buildAlternates(loc),
    });
  });

  posts.forEach((post) => {
    const postId = String(post.id || '').trim();
    if (!postId) return;
    const loc = `${baseUrl}/posts/${encodeURIComponent(postId)}`;
    entries.set(loc, {
      loc,
      lastmod: normalizeLastmod(post.lastmod),
      changefreq,
      priority: 0.7,
      alternates: buildAlternates(loc),
    });
  });

  return [...entries.values()];
}

export function renderSitemapXml(entries: SitemapEntry[]) {
  const rows = entries
    .map(
      (entry) => `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>\n${entry.alternates
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${xmlEscape(alternate.href)}" />`,
        )
        .join('\n')}\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows}\n</urlset>\n`;
}
