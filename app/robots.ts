import type { MetadataRoute } from 'next';
import { getBaseUrl } from './lib/seo.server';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/mo/'],
    },
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/rss.xml`],
    host: baseUrl,
  };
}
