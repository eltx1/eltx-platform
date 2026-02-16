import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lordai.net';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [
    '',
    '/signup',
    '/login',
    '/contact',
    '/privacy',
    '/terms',
    '/faq',
    '/status',
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    changefreq: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  return routes;
}
