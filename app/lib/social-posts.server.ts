import 'server-only';

import { RowDataPacket } from 'mysql2';
import { getDb } from './db.server';
import { demoSocialPosts, isSocialDemoMode, normalizeHandle, normalizePostImageUrl } from './social-posts.shared';

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

export async function getPublicSocialPostById(postId: string) {
  const normalizedPostId = String(postId || '').trim();
  if (!normalizedPostId) return null;

  if (isSocialDemoMode) {
    const demoPost = demoSocialPosts.find((post) => post.id === normalizedPostId);
    return demoPost ? { ...demoPost } : null;
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
