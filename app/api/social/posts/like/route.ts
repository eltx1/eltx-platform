import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getDb } from '../../../../lib/db.server';

type CountRow = RowDataPacket & { likes: number };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const postId = Number(body?.postId);
    const userId = Number(body?.userId);
    if (!Number.isFinite(postId) || !Number.isFinite(userId) || postId <= 0 || userId <= 0) {
      return NextResponse.json({ error: 'Valid postId and userId are required' }, { status: 400 });
    }

    const db = getDb();
    const [existingRows] = await db.query<RowDataPacket[]>('SELECT id FROM social_post_likes WHERE post_id = ? AND user_id = ? LIMIT 1', [postId, userId]);
    let liked = false;
    if (existingRows.length) {
      await db.query('DELETE FROM social_post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      liked = false;
    } else {
      await db.query('INSERT INTO social_post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
      liked = true;
    }

    const [countRows] = await db.query<CountRow[]>('SELECT COUNT(*) AS likes FROM social_post_likes WHERE post_id = ?', [postId]);
    return NextResponse.json({ liked, likes: Number(countRows[0]?.likes || 0) });
  } catch (error) {
    console.error('toggle like failed', error);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}
