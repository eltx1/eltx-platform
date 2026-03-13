import path from 'path';
import { access, mkdir, readFile, writeFile } from 'fs/promises';

const FALLBACK_STORAGE_ROOT = path.join(process.env.HOME || process.cwd(), 'lordai-storage');
const SOCIAL_UPLOADS_ROOT = path.resolve(process.env.SOCIAL_UPLOADS_DIR || path.join(FALLBACK_STORAGE_ROOT, 'social-uploads'));

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

export function getSocialImagePublicUrl(filename: string) {
  return `/api/social/uploads/${encodeURIComponent(filename)}`;
}

export function resolveSocialImageFilename(raw: string) {
  const normalized = String(raw || '').trim();
  if (!normalized || normalized.includes('/') || normalized.includes('\\')) return null;
  return normalized;
}

export function getSocialImageContentType(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return CONTENT_TYPE_BY_EXT[extension] || 'application/octet-stream';
}

export async function saveSocialImage(filename: string, bytes: Buffer) {
  const safeFilename = resolveSocialImageFilename(filename);
  if (!safeFilename) {
    throw new Error('Invalid social image filename');
  }

  await mkdir(SOCIAL_UPLOADS_ROOT, { recursive: true });
  const filePath = path.join(SOCIAL_UPLOADS_ROOT, safeFilename);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function readSocialImage(filename: string) {
  const safeFilename = resolveSocialImageFilename(filename);
  if (!safeFilename) return null;

  const filePath = path.join(SOCIAL_UPLOADS_ROOT, safeFilename);
  try {
    await access(filePath);
    const bytes = await readFile(filePath);
    return {
      bytes,
      contentType: getSocialImageContentType(safeFilename),
    };
  } catch {
    return null;
  }
}
