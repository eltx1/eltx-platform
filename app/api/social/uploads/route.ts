import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSocialImagePublicUrl, saveSocialImage } from '../../../lib/social-image-storage';
import { getSocialUploadLimitBytes } from '../../../lib/social-upload-settings';
import { readSocialUploadSettings } from '../../../lib/social-upload-settings.server';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

function extensionFromMime(type: string) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/avif') return 'avif';
  return 'jpg';
}

export async function POST(request: Request) {
  try {
    const settings = await readSocialUploadSettings();
    const maxBytes = getSocialUploadLimitBytes(settings);
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }

    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'Image is too large', maxImageUploadMb: settings.maxImageUploadMb }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = extensionFromMime(file.type);
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;

    await saveSocialImage(filename, bytes);
    return NextResponse.json({ ok: true, imageUrl: getSocialImagePublicUrl(filename), optimizedBytes: bytes.length });
  } catch (error) {
    console.error('social upload POST failed', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
