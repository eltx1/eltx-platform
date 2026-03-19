import 'server-only';

import { RowDataPacket } from 'mysql2';
import { getDb } from './db.server';

const isSocialDemoMode =
  process.env.DEMO_MODE === '1'
  || process.env.DEMO_MODE === 'true'
  || !process.env.DATABASE_URL
  || !process.env.DB_HOST
  || !process.env.DB_USER
  || !process.env.DB_NAME;

export type PublicSocialPost = {
  id: string;
  profileId: string;
  authorName: string;
  handle: string;
  content: string;
  createdAt: string;
  avatarUrl: string | null;
  imageUrl: string | null;
};

type PostRow = RowDataPacket & {
  id: number;
  user_id: number;
  content: string;
  image_url: string | null;
  created_at: string;
  author_name: string;
  handle: string;
  avatar_url: string | null;
};

const demoSocialPosts: PublicSocialPost[] = [
  {
    id: 'demo-post-1',
    profileId: '1',
    authorName: 'LordAI Creator',
    handle: '@lordai_creator',
    content: 'Demo mode: social post media rendering check ✅',
    createdAt: '2026-03-13T09:15:00.000Z',
    avatarUrl: '/assets/img/logo-new.svg',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
  },
];

function normalizeHandle(handle?: string | null, fallback?: string) {
  const raw = String(handle || fallback || 'user').trim().replace(/^@+/, '') || 'user';
  return `@${raw.toLowerCase()}`;
}

function normalizePostImageUrl(rawValue?: string | null) {
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

export async function getPublicSocialPostById(postId: string) {
  const normalizedPostId = String(postId || '').trim();
  if (!normalizedPostId) return null;

  if (isSocialDemoMode) {
    return demoSocialPosts.find((post) => post.id === normalizedPostId) || null;
  }

  try {
    const db = getDb();
    const [rows] = await db.query<PostRow[]>(
      `SELECT p.id, p.user_id, p.content, p.image_url, p.created_at,
              COALESCE(sp.public_name, u.username, CONCAT('User ', p.user_id)) AS author_name,
              COALESCE(sp.handle, u.username, CONCAT('user', p.user_id)) AS handle,
              COALESCE(sp.avatar_url, '/assets/img/logo-new.svg') AS avatar_url
         FROM social_posts p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN social_profiles sp ON sp.user_id = p.user_id
        WHERE p.id = ?
        LIMIT 1`,
      [normalizedPostId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      profileId: String(row.user_id),
      authorName: row.author_name,
      handle: normalizeHandle(row.handle, `user${row.user_id}`),
      content: row.content,
      createdAt: new Date(row.created_at).toISOString(),
      avatarUrl: row.avatar_url,
      imageUrl: normalizePostImageUrl(row.image_url),
    } satisfies PublicSocialPost;
  } catch (error) {
    console.error('getPublicSocialPostById failed', error);
    return null;
  }
}
