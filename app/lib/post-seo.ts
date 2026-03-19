import type { Metadata } from 'next';

type PostSeoInput = {
  id: string;
  authorName?: string | null;
  handle?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  createdAt?: string | null;
};

const SITE_NAME = 'LordAi.Net';
const DEFAULT_KEYWORDS = ['LordAi.Net', 'social post', 'Web3 social'];
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'your', 'into', 'على', 'من', 'في', 'مع', 'الى', 'إلى', 'عن', 'هذا', 'هذه', 'تم', 'post', 'lordai', 'net', 'http', 'https'
]);

function normalizeText(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#*_`>~\[\](){}|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, Math.max(0, maxLength - 1)).trim();
  return `${sliced}…`;
}

function toAbsoluteUrl(value: string | null | undefined, baseUrl: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return `${baseUrl}/assets/img/logo-new.svg`;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return `${baseUrl}${normalized}`;
  return `${baseUrl}/assets/img/logo-new.svg`;
}

export function buildPostDescription(content?: string | null, maxLength = 160) {
  const normalized = normalizeText(String(content || ''));
  if (!normalized) {
    return 'Read the latest community update on LordAi.Net.';
  }
  return truncate(normalized, maxLength);
}

export function extractPostKeywords(input: PostSeoInput, limit = 12) {
  const content = normalizeText(String(input.content || ''));
  const matches = content.match(/[\p{L}\p{N}_-]{3,}/gu) || [];
  const score = new Map<string, number>();

  matches.forEach((rawToken) => {
    const token = rawToken.toLowerCase();
    if (STOP_WORDS.has(token)) return;
    const nextScore = (score.get(token) || 0) + 1;
    score.set(token, nextScore);
  });

  const ranked = [...score.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([token]) => token)
    .slice(0, Math.max(0, limit - 4));

  const authorName = String(input.authorName || '').trim();
  const handle = String(input.handle || '').trim();
  const keywords = [...DEFAULT_KEYWORDS];
  if (authorName) keywords.push(authorName);
  if (handle) keywords.push(handle.replace(/^@+/, ''));
  return [...new Set([...keywords, ...ranked])].slice(0, limit);
}

export function buildPostTitle(input: PostSeoInput) {
  const authorName = String(input.authorName || '').trim();
  const snippet = buildPostDescription(input.content, 55);
  if (authorName) {
    return `${authorName} post | ${snippet}`;
  }
  return `Community post | ${snippet}`;
}

export function buildPostMetadata(input: PostSeoInput, baseUrl: string): Metadata {
  const canonical = `${baseUrl}/posts/${encodeURIComponent(String(input.id || '').trim())}`;
  const title = buildPostTitle(input);
  const description = buildPostDescription(input.content);
  const keywords = extractPostKeywords(input);
  const publishedTime = input.createdAt ? new Date(input.createdAt).toISOString() : undefined;
  const imageUrl = toAbsoluteUrl(input.imageUrl, baseUrl);

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: 'article',
      publishedTime,
      authors: input.authorName ? [String(input.authorName)] : undefined,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function buildPostJsonLd(input: PostSeoInput, baseUrl: string) {
  const canonical = `${baseUrl}/posts/${encodeURIComponent(String(input.id || '').trim())}`;
  const description = buildPostDescription(input.content, 220);
  return {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: buildPostTitle(input),
    description,
    datePublished: input.createdAt ? new Date(input.createdAt).toISOString() : undefined,
    dateModified: input.createdAt ? new Date(input.createdAt).toISOString() : undefined,
    url: canonical,
    articleBody: normalizeText(String(input.content || '')),
    keywords: extractPostKeywords(input).join(', '),
    author: {
      '@type': 'Person',
      name: String(input.authorName || input.handle || 'LordAi.Net Creator').trim(),
      alternateName: String(input.handle || '').trim() || undefined,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: baseUrl,
    },
    image: toAbsoluteUrl(input.imageUrl, baseUrl),
    mainEntityOfPage: canonical,
  };
}
