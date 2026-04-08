import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getDb } from '../../../../lib/db.server';
import { normalizeHandle, normalizePostImageUrl } from '../../../../lib/social-posts.shared';

const isSocialDemoMode =
  process.env.DEMO_MODE === '1'
  || process.env.DEMO_MODE === 'true'
  || !process.env.DATABASE_URL
  || !process.env.DB_HOST
  || !process.env.DB_USER
  || !process.env.DB_NAME;

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
  premium_followers: number;
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
    authorPremiumFollowers: 36,
    isPremium: false,
    viewerLiked: false,
    viewerReposted: false,
    commentsList: [],
  },
];

async function loadComments(postId: number) {
  const db = getDb();
  const [rows] = await db.query<CommentRow[]>(
    `SELECT c.id, c.post_id, c.content, c.created_at,
            COALESCE(sp.public_name, u.username, CONCAT('User ', c.user_id)) AS author_name,
            COALESCE(sp.handle, u.username, CONCAT('user', c.user_id)) AS handle
       FROM social_post_comments c
  LEFT JOIN social_profiles sp ON sp.user_id = c.user_id
  LEFT JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ?
   ORDER BY c.created_at DESC`,
    [postId],
  );

  return rows.map((row) => ({
    id: String(row.id),
    postId: String(row.post_id),
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    authorName: row.author_name,
    handle: normalizeHandle(row.handle),
  }));
}

export async function GET(request: Request, context: { params: { postId: string } }) {
  const postId = decodeURIComponent(String(context.params.postId || '').trim());
  if (!postId) {
    return NextResponse.json({ error: 'Post id is required' }, { status: 400 });
  }

  if (isSocialDemoMode) {
    const post = demoSocialPosts.find((item) => item.id === postId);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    return NextResponse.json({ post });
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
              COALESCE(pf.premium_followers, 0) AS premium_followers,
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
    LEFT JOIN (
      SELECT sf.followee_id, COUNT(*) AS premium_followers
        FROM social_follows sf
        JOIN users fu ON fu.id = sf.follower_id
       WHERE fu.is_premium = 1
         AND fu.premium_expires_at IS NOT NULL
         AND fu.premium_expires_at > NOW()
    GROUP BY sf.followee_id
    ) pf ON pf.followee_id = p.user_id
    LEFT JOIN social_post_likes vl ON vl.post_id = p.id AND vl.user_id = ?
    LEFT JOIN social_post_reposts vr ON vr.post_id = p.id AND vr.user_id = ?
    LEFT JOIN social_follows vf ON vf.followee_id = p.user_id AND vf.follower_id = ?
        WHERE p.id = ?
        LIMIT 1`,
      [
        Number.isFinite(viewerId) ? viewerId : 0,
        Number.isFinite(viewerId) ? viewerId : 0,
        Number.isFinite(viewerId) ? viewerId : 0,
        postId,
      ],
    );

    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const commentsList = await loadComments(row.id);

    return NextResponse.json({
      post: {
        id: String(row.id),
        profileId: String(row.user_id),
        authorName: row.author_name,
        handle: normalizeHandle(row.handle, `user${row.user_id}`),
        content: row.content,
        createdAt: new Date(row.created_at).toISOString(),
        avatarUrl: row.avatar_url,
        imageUrl: normalizePostImageUrl(row.image_url),
        likes: Number(row.likes || 0),
        comments: Number(row.comments || 0),
        reposts: Number(row.reposts || 0),
        views: 0,
        authorFollowers: Number(row.followers || 0),
        authorPremiumFollowers: Number(row.premium_followers || 0),
        isFollowed: Boolean(row.viewer_followed),
        isPremium: false,
        viewerLiked: Boolean(row.viewer_liked),
        viewerReposted: Boolean(row.viewer_reposted),
        commentsList,
      },
    });
  } catch (error) {
    console.error('social post details GET failed', error);
    return NextResponse.json({ error: 'Failed to load post' }, { status: 500 });
  }
}
