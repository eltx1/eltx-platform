export const isSocialDemoMode =
  process.env.DEMO_MODE === '1'
  || process.env.DEMO_MODE === 'true'
  || !process.env.DATABASE_URL
  || !process.env.DB_HOST
  || !process.env.DB_USER
  || !process.env.DB_NAME;

export const demoSocialPosts = [
  {
    id: 'demo-post-1',
    profileId: '1',
    authorName: 'LordAI Creator',
    handle: '@lordai_creator',
    content: 'Demo mode: social post media rendering check ✅',
    createdAt: '2026-03-13T09:15:00.000Z',
    avatarUrl: '/assets/img/logo-new.svg',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    likes: 7,
    comments: 2,
    reposts: 1,
    views: 123,
    authorFollowers: 340,
    authorPremiumFollowers: 36,
    isPremium: false,
    viewerLiked: false,
    viewerReposted: false,
    commentsList: [],
  },
] as const;

export function normalizeHandle(handle?: string | null, fallback?: string) {
  const raw = String(handle || fallback || 'user').trim().replace(/^@+/, '') || 'user';
  return `@${raw.toLowerCase()}`;
}

export function normalizePostImageUrl(rawValue?: string | null) {
  const value = String(rawValue || '').trim();
  if (!value || value === 'about:blank') return null;

  const legacySocialUploadMatch = value.match(/^\/uploads\/social\/([^/?#]+)$/i);
  if (legacySocialUploadMatch?.[1]) {
    return `/api/social/uploads/${encodeURIComponent(legacySocialUploadMatch[1])}`;
  }

  if (value.startsWith('/')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('data:image/')) return value;
  return null;
}
