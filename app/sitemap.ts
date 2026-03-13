import type { MetadataRoute } from 'next';
import { getBaseUrl, loadPublicSitemapPosts, readSeoSettings } from './lib/seo.server';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const settings = await readSeoSettings();
  const posts = await loadPublicSitemapPosts(1500);
  const staticRoutes: Array<{ path: string; priority: number }> = [
    { path: '', priority: 1 },
    { path: '/signup', priority: 0.8 },
    { path: '/login', priority: 0.6 },
    { path: '/contact', priority: 0.6 },
    { path: '/privacy', priority: 0.5 },
    { path: '/terms', priority: 0.5 },
    { path: '/child-safety', priority: 0.5 },
    { path: '/faq', priority: 0.7 },
    { path: '/status', priority: 0.5 },
    { path: '/for-you', priority: 0.9 },
  ];

  const changefreq = settings.sitemapRefreshHours <= 6 ? 'hourly' : 'daily';

  const routes: MetadataRoute.Sitemap = staticRoutes.map((item) => ({
    url: `${baseUrl}${item.path}`,
    changefreq,
    priority: item.priority,
    lastModified: new Date(),
  }));

  posts.forEach((post) => {
    routes.push({
      url: `${baseUrl}/posts/${encodeURIComponent(post.id)}`,
      lastModified: post.lastmod,
      changefreq,
      priority: 0.7,
    });
  });

  if (settings.includeRssInSitemap) {
    routes.push({
      url: `${baseUrl}/rss.xml`,
      lastModified: new Date(),
      changefreq: 'daily',
      priority: 0.4,
    });
  }

  return routes;
}
