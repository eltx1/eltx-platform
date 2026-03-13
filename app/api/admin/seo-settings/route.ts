import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '../../../lib/db.server';
import { readSeoSettings, writeSeoSettings } from '../../../lib/seo.server';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'asid';

async function requireAdminAuthorization() {
  const sessionToken = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!sessionToken) return { ok: false as const, status: 401, error: 'Admin authentication required' };

  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT au.id
         FROM admin_sessions s
         JOIN admin_users au ON au.id = s.admin_id
        WHERE s.id = ? AND s.expires_at > NOW() AND au.is_active = 1
        LIMIT 1`,
      [sessionToken],
    );
    const row = (rows as Array<{ id?: number }>)[0];
    if (!row?.id) return { ok: false as const, status: 403, error: 'Admin authorization failed' };
    return { ok: true as const };
  } catch (error) {
    console.error('seo settings admin auth error', error);
    return { ok: false as const, status: 503, error: 'Admin authorization unavailable' };
  }
}

export async function GET() {
  const settings = await readSeoSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminAuthorization();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const settings = await writeSeoSettings(body?.settings || body);
  return NextResponse.json({ settings });
}
