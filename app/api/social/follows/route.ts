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

type CountRow = RowDataPacket & { followers: number };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const followerId = Number(body?.followerId);
    const followeeId = Number(body?.followeeId);

    if (!Number.isFinite(followerId) || !Number.isFinite(followeeId) || followerId <= 0 || followeeId <= 0) {
      return NextResponse.json({ error: 'Valid followerId and followeeId are required' }, { status: 400 });
    }

    if (followerId === followeeId) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
    }

    if (isSocialDemoMode) {
      return NextResponse.json({ ok: true, isFollowed: true, followers: 1, demoMode: true });
    }

    const db = getDb();
    const [existingRows] = await db.query<RowDataPacket[]>(
      'SELECT id FROM social_follows WHERE follower_id = ? AND followee_id = ? LIMIT 1',
      [followerId, followeeId],
    );

    let isFollowed = false;
    if (existingRows.length) {
      await db.query('DELETE FROM social_follows WHERE follower_id = ? AND followee_id = ?', [followerId, followeeId]);
      isFollowed = false;
    } else {
      await db.query('INSERT INTO social_follows (follower_id, followee_id) VALUES (?, ?)', [followerId, followeeId]);
      isFollowed = true;
    }

    const [countRows] = await db.query<CountRow[]>(
      'SELECT COUNT(*) AS followers FROM social_follows WHERE followee_id = ?',
      [followeeId],
    );

    return NextResponse.json({ isFollowed, followers: Number(countRows[0]?.followers || 0) });
  } catch (error) {
    console.error('toggle follow failed', error);
    return NextResponse.json({ error: 'Failed to toggle follow' }, { status: 500 });
  }
}
