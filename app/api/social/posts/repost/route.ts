import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getDb } from '../../../../lib/db.server';

type CountRow = RowDataPacket & { reposts: number };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const postId = Number(body?.postId);
    const userId = Number(body?.userId);
    if (!Number.isFinite(postId) || !Number.isFinite(userId) || postId <= 0 || userId <= 0) {
      return NextResponse.json({ error: 'Valid postId and userId are required' }, { status: 400 });
    }

    const db = getDb();
    const [existingRows] = await db.query<RowDataPacket[]>('SELECT id FROM social_post_reposts WHERE post_id = ? AND user_id = ? LIMIT 1', [postId, userId]);
    let reposted = false;
    if (existingRows.length) {
      await db.query('DELETE FROM social_post_reposts WHERE post_id = ? AND user_id = ?', [postId, userId]);
      reposted = false;
    } else {
      await db.query('INSERT INTO social_post_reposts (post_id, user_id) VALUES (?, ?)', [postId, userId]);
      reposted = true;
    }

    const [countRows] = await db.query<CountRow[]>('SELECT COUNT(*) AS reposts FROM social_post_reposts WHERE post_id = ?', [postId]);
    return NextResponse.json({ reposted, reposts: Number(countRows[0]?.reposts || 0) });
  } catch (error) {
    console.error('toggle repost failed', error);
    return NextResponse.json({ error: 'Failed to toggle repost' }, { status: 500 });
  }
}
