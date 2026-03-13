import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

const MAX_IMAGE_FILE_SIZE_BYTES = 3 * 1024 * 1024;
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
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = extensionFromMime(file.type);
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;

    const relativeDir = path.join('uploads', 'social');
    const publicDir = path.join(process.cwd(), 'public', relativeDir);
    await mkdir(publicDir, { recursive: true });

    const absolutePath = path.join(publicDir, filename);
    await writeFile(absolutePath, bytes);

    return NextResponse.json({ ok: true, imageUrl: `/${relativeDir}/${filename}` });
  } catch (error) {
    console.error('social upload POST failed', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
