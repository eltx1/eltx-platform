import { NextResponse } from 'next/server';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getDb } from '../../../../lib/db.server';

type CommentRow = RowDataPacket & {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
  author_name: string;
  handle: string;
};

type CountRow = RowDataPacket & { comments: number };

function normalizeHandle(handle?: string | null, fallback?: string) {
  const raw = String(handle || fallback || 'user').trim().replace(/^@+/, '') || 'user';
  return `@${raw.toLowerCase()}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const postId = Number(body?.postId);
    const userId = Number(body?.userId);
    const content = String(body?.content || '').trim();
    const profile = body?.profile || {};

    if (!Number.isFinite(postId) || !Number.isFinite(userId) || postId <= 0 || userId <= 0) {
      return NextResponse.json({ error: 'Valid postId and userId are required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    const db = getDb();

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

    const [insertResult] = await db.query<ResultSetHeader>('INSERT INTO social_post_comments (post_id, user_id, content) VALUES (?, ?, ?)', [postId, userId, content]);

    const [commentRows] = await db.query<CommentRow[]>(
      `SELECT c.id, c.post_id, c.content, c.created_at,
              COALESCE(sp.public_name, u.username, CONCAT('User ', c.user_id)) AS author_name,
              COALESCE(sp.handle, u.username, CONCAT('user', c.user_id)) AS handle
         FROM social_post_comments c
    LEFT JOIN social_profiles sp ON sp.user_id = c.user_id
    LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = ?
        LIMIT 1`,
      [insertResult.insertId],
    );

    const [countRows] = await db.query<CountRow[]>('SELECT COUNT(*) AS comments FROM social_post_comments WHERE post_id = ?', [postId]);

    const [allRows] = await db.query<CommentRow[]>(
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

    const mapRow = (row: CommentRow) => ({
      id: String(row.id),
      postId: String(row.post_id),
      authorName: row.author_name,
      handle: normalizeHandle(row.handle),
      content: row.content,
      createdAt: new Date(row.created_at).toISOString(),
    });

    return NextResponse.json({
      comment: commentRows[0] ? mapRow(commentRows[0]) : null,
      comments: Number(countRows[0]?.comments || 0),
      commentsList: allRows.map(mapRow),
    });
  } catch (error) {
    console.error('add comment failed', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
