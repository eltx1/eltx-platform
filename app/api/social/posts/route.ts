import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getDb } from '../../../lib/db.server';

const isSocialDemoMode =
  process.env.DEMO_MODE === '1'
  || process.env.DEMO_MODE === 'true'
  || !process.env.DATABASE_URL
  || !process.env.DB_HOST
  || !process.env.DB_USER
  || !process.env.DB_NAME;

const demoSocialPosts = [
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
    isPremium: false,
    viewerLiked: false,
    viewerReposted: false,
    commentsList: [],
  },
];

type PostRow = RowDataPacket & {
  id: number;
  user_id: number;
  content: string;
  image_url: string | null;
  created_at: string;
  likes: number;
  comments: number;
  reposts: number;
  author_name: string;
  handle: string;
  avatar_url: string | null;
  followers: number;
  viewer_liked: number;
  viewer_reposted: number;
  viewer_followed: number;
};

type CommentRow = RowDataPacket & {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
  author_name: string;
  handle: string;
};

function normalizeHandle(handle?: string | null, fallback?: string) {
  const raw = String(handle || fallback || 'user').trim().replace(/^@+/, '') || 'user';
  return `@${raw.toLowerCase()}`;
}

async function loadComments(postIds: number[]) {
  if (!postIds.length) return new Map<number, any[]>();
  const db = getDb();
  const placeholders = postIds.map(() => '?').join(',');
  const [rows] = await db.query<CommentRow[]>(
    `SELECT c.id, c.post_id, c.content, c.created_at,
            COALESCE(sp.public_name, u.username, CONCAT('User ', c.user_id)) AS author_name,
            COALESCE(sp.handle, u.username, CONCAT('user', c.user_id)) AS handle
       FROM social_post_comments c
  LEFT JOIN social_profiles sp ON sp.user_id = c.user_id
  LEFT JOIN users u ON u.id = c.user_id
      WHERE c.post_id IN (${placeholders})
   ORDER BY c.created_at DESC`,
    postIds,
  );

  const byPost = new Map<number, any[]>();
  rows.forEach((row) => {
    if (!byPost.has(row.post_id)) byPost.set(row.post_id, []);
    byPost.get(row.post_id)?.push({
      id: String(row.id),
      postId: String(row.post_id),
      content: row.content,
      createdAt: new Date(row.created_at).toISOString(),
      authorName: row.author_name,
      handle: normalizeHandle(row.handle),
    });
  });
  return byPost;
}

export async function GET(request: Request) {
  if (isSocialDemoMode) {
    return NextResponse.json({ posts: demoSocialPosts });
  }

  try {
    const db = getDb();
    const viewerIdParam = new URL(request.url).searchParams.get('viewerId');
    const viewerId = Number(viewerIdParam || 0);

    const [rows] = await db.query<PostRow[]>(
      `SELECT p.id, p.user_id, p.content, p.image_url, p.created_at,
              COALESCE(sp.public_name, u.username, CONCAT('User ', p.user_id)) AS author_name,
              COALESCE(sp.handle, u.username, CONCAT('user', p.user_id)) AS handle,
              COALESCE(sp.avatar_url, '/assets/img/logo-new.svg') AS avatar_url,
              COALESCE(f.followers, 0) AS followers,
              COALESCE(l.likes, 0) AS likes,
              COALESCE(c.comments, 0) AS comments,
              COALESCE(r.reposts, 0) AS reposts,
              CASE WHEN vl.id IS NULL THEN 0 ELSE 1 END AS viewer_liked,
              CASE WHEN vr.id IS NULL THEN 0 ELSE 1 END AS viewer_reposted,
              CASE WHEN vf.id IS NULL THEN 0 ELSE 1 END AS viewer_followed
         FROM social_posts p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN social_profiles sp ON sp.user_id = p.user_id
    LEFT JOIN (SELECT post_id, COUNT(*) AS likes FROM social_post_likes GROUP BY post_id) l ON l.post_id = p.id
    LEFT JOIN (SELECT post_id, COUNT(*) AS comments FROM social_post_comments GROUP BY post_id) c ON c.post_id = p.id
    LEFT JOIN (SELECT post_id, COUNT(*) AS reposts FROM social_post_reposts GROUP BY post_id) r ON r.post_id = p.id
    LEFT JOIN (SELECT followee_id, COUNT(*) AS followers FROM social_follows GROUP BY followee_id) f ON f.followee_id = p.user_id
    LEFT JOIN social_post_likes vl ON vl.post_id = p.id AND vl.user_id = ?
    LEFT JOIN social_post_reposts vr ON vr.post_id = p.id AND vr.user_id = ?
    LEFT JOIN social_follows vf ON vf.followee_id = p.user_id AND vf.follower_id = ?
     ORDER BY p.created_at DESC
        LIMIT 500`,
      [
        Number.isFinite(viewerId) ? viewerId : 0,
        Number.isFinite(viewerId) ? viewerId : 0,
        Number.isFinite(viewerId) ? viewerId : 0,
      ],
    );

    const commentsByPost = await loadComments(rows.map((row) => row.id));

    return NextResponse.json({
      posts: rows.map((row) => ({
        id: String(row.id),
        profileId: String(row.user_id),
        authorName: row.author_name,
        handle: normalizeHandle(row.handle, `user${row.user_id}`),
        content: row.content,
        createdAt: new Date(row.created_at).toISOString(),
        avatarUrl: row.avatar_url,
        imageUrl: row.image_url,
        likes: Number(row.likes || 0),
        comments: Number(row.comments || 0),
        reposts: Number(row.reposts || 0),
        views: 0,
        authorFollowers: Number(row.followers || 0),
        isFollowed: Boolean(row.viewer_followed),
        isPremium: false,
        viewerLiked: Boolean(row.viewer_liked),
        viewerReposted: Boolean(row.viewer_reposted),
        commentsList: commentsByPost.get(row.id) || [],
      })),
    });
  } catch (error) {
    console.error('social posts GET failed', error);
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (isSocialDemoMode) {
    const body = await request.json();
    const userId = Number(body?.userId);
    const content = String(body?.content || '').trim();
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid userId is required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, demoMode: true });
  }

  try {
    const body = await request.json();
    const userId = Number(body?.userId);
    const content = String(body?.content || '').trim();
    const imageUrl = body?.imageUrl ? String(body.imageUrl) : null;
    const profile = body?.profile || {};

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid userId is required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const db = getDb();
    await db.query(
      `INSERT INTO social_posts (user_id, content, image_url, word_count)
       VALUES (?, ?, ?, ?)`,
      [userId, content, imageUrl, content.split(/\s+/).filter(Boolean).length],
    );

    await db.query(
      `INSERT INTO social_profiles (user_id, public_name, handle, bio, avatar_url)
       VALUES (?, ?, ?, '', ?)
       ON DUPLICATE KEY UPDATE
         public_name = VALUES(public_name),
         handle = VALUES(handle),
         avatar_url = VALUES(avatar_url)`,
      [
        userId,
        String(profile.publicName || `User ${userId}`),
        normalizeHandle(profile.handle, `user${userId}`),
        String(profile.avatarUrl || '/assets/img/logo-new.svg'),
      ],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('social posts POST failed', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
