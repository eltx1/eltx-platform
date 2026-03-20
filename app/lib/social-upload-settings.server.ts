import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from './db.server';
import {
  DEFAULT_SOCIAL_UPLOAD_SETTINGS,
  normalizeSocialUploadSettings,
  SOCIAL_UPLOAD_DB_SETTING_NAME,
  SOCIAL_UPLOAD_FILE_PATH,
  type SocialUploadSettings,
} from './social-upload-settings';

const filePath = path.join(process.cwd(), SOCIAL_UPLOAD_FILE_PATH);

export async function readSocialUploadSettings(): Promise<SocialUploadSettings> {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT value FROM platform_settings WHERE name = ? LIMIT 1', [SOCIAL_UPLOAD_DB_SETTING_NAME]);
    const row = (rows as Array<{ value?: string }>)[0];
    if (row?.value) {
      return normalizeSocialUploadSettings(JSON.parse(row.value));
    }
  } catch {
    // Ignore DB read failures and fallback to file/default mode.
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeSocialUploadSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SOCIAL_UPLOAD_SETTINGS;
  }
}

export async function writeSocialUploadSettings(settings: SocialUploadSettings) {
  const normalized = normalizeSocialUploadSettings(settings);

  try {
    const db = getDb();
    await db.query(
      `INSERT INTO platform_settings (name, value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [SOCIAL_UPLOAD_DB_SETTING_NAME, JSON.stringify(normalized)],
    );
  } catch {
    // Fallback to file-only mode when DB is not available.
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2));
  return normalized;
}
