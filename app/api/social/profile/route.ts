import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getDb } from '../../../lib/db.server';

const DEFAULT_AVATAR_URL = '/assets/img/logo-new.svg';

const isSocialDemoMode =
  process.env.DEMO_MODE === '1'
  || process.env.DEMO_MODE === 'true'
  || !process.env.DATABASE_URL
  || !process.env.DB_HOST
  || !process.env.DB_USER
  || !process.env.DB_NAME;

type ProfileRow = RowDataPacket & {
  user_id: number;
  public_name: string;
  handle: string;
  bio: string | null;
  avatar_url: string | null;
};

function normalizeHandle(handle?: string | null, fallback?: string) {
  const raw = String(handle || fallback || 'user').trim().replace(/^@+/, '') || 'user';
  return `@${raw.toLowerCase()}`;
}

function normalizeAvatarUrl(rawUrl?: string | null) {
  const value = String(rawUrl || '').trim();
  if (!value) return DEFAULT_AVATAR_URL;

  const legacySocialUploadMatch = value.match(/^\/uploads\/social\/([^/?#]+)$/i);
  if (legacySocialUploadMatch?.[1]) {
    return `/api/social/uploads/${encodeURIComponent(legacySocialUploadMatch[1])}`;
  }

  if (value.startsWith('/')) return value;
  if (value.startsWith('data:image/')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return DEFAULT_AVATAR_URL;
}

export async function GET(request: Request) {
  const userId = Number(new URL(request.url).searchParams.get('userId'));
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Valid userId is required' }, { status: 400 });
  }

  if (isSocialDemoMode) {
    return NextResponse.json({
      profile: {
        publicName: `User ${userId}`,
        handle: `@user${userId}`,
        bio: '',
        avatarUrl: DEFAULT_AVATAR_URL,
      },
      demoMode: true,
    });
  }

  try {
    const db = getDb();
    const [rows] = await db.query<ProfileRow[]>(
      `SELECT user_id, public_name, handle, bio, avatar_url
         FROM social_profiles
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({
      profile: {
        publicName: String(row.public_name || `User ${row.user_id}`),
        handle: normalizeHandle(row.handle, `user${row.user_id}`),
        bio: String(row.bio || ''),
        avatarUrl: normalizeAvatarUrl(row.avatar_url),
      },
    });
  } catch (error) {
    console.error('social profile GET failed', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = Number(body?.userId);
    const profile = body?.profile || {};

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid userId is required' }, { status: 400 });
    }

    const normalizedProfile = {
      publicName: String(profile.publicName || `User ${userId}`).trim() || `User ${userId}`,
      handle: normalizeHandle(profile.handle, `user${userId}`),
      bio: String(profile.bio || ''),
      avatarUrl: normalizeAvatarUrl(profile.avatarUrl),
    };

    if (isSocialDemoMode) {
      return NextResponse.json({ ok: true, profile: normalizedProfile, demoMode: true });
    }

    const db = getDb();
    await db.query(
      `INSERT INTO social_profiles (user_id, public_name, handle, bio, avatar_url)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         public_name = VALUES(public_name),
         handle = VALUES(handle),
         bio = VALUES(bio),
         avatar_url = VALUES(avatar_url)`,
      [userId, normalizedProfile.publicName, normalizedProfile.handle, normalizedProfile.bio, normalizedProfile.avatarUrl],
    );

    return NextResponse.json({ ok: true, profile: normalizedProfile });
  } catch (error) {
    console.error('social profile POST failed', error);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
