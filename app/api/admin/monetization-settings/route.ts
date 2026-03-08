import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '../../../lib/db.server';

const filePath = path.join(process.cwd(), 'data', 'monetization-settings.json');
const DB_SETTING_NAME = 'creator_monetization_settings_json';
const ADMIN_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'asid';

type MonetizationSettings = {
  requiredPremiumFollowers: number;
  payoutPerThousandViews: number;
};

const defaults: MonetizationSettings = {
  requiredPremiumFollowers: 10,
  payoutPerThousandViews: 0.01,
};

function normalize(input: Partial<MonetizationSettings> | null | undefined): MonetizationSettings {
  return {
    requiredPremiumFollowers: Math.max(1, Math.floor(Number(input?.requiredPremiumFollowers ?? defaults.requiredPremiumFollowers))),
    payoutPerThousandViews: Math.max(0, Number(input?.payoutPerThousandViews ?? defaults.payoutPerThousandViews)),
  };
}

async function requireAdminAuthorization() {
  const sessionToken = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return { ok: false as const, status: 401, error: 'Admin authentication required' };
  }

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
    if (!row?.id) {
      return { ok: false as const, status: 403, error: 'Admin authorization failed' };
    }

    return { ok: true as const };
  } catch (error) {
    console.error('monetization settings admin auth error', error);
    return { ok: false as const, status: 503, error: 'Admin authorization unavailable' };
  }
}

async function readFromFile() {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readFromDb() {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [DB_SETTING_NAME]);
    const row = (rows as Array<{ value?: string }>)[0];
    if (!row?.value) return null;
    return normalize(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function writeToFile(settings: MonetizationSettings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

async function writeToDb(settings: MonetizationSettings) {
  const db = getDb();
  await db.query(
    `INSERT INTO platform_settings (name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [DB_SETTING_NAME, JSON.stringify(settings)],
  );
}

async function readSettings() {
  return (await readFromDb()) || (await readFromFile()) || defaults;
}

export async function GET() {
  const settings = await readSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminAuthorization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const settings = normalize(body?.settings || body);
  try {
    await writeToDb(settings);
  } catch {
    // Fallback to file-only mode when DB is not available.
  }
  await writeToFile(settings);
  return NextResponse.json({ settings });
}
