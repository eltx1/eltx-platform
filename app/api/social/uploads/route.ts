import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSocialImagePublicUrl, saveSocialImage } from '../../../lib/social-image-storage';
import { getSocialUploadLimitBytes } from '../../../lib/social-upload-settings';
import { readSocialUploadSettings } from '../../../lib/social-upload-settings.server';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIGNATURE_BYTES = 16;
const EXECUTABLE_SIGNATURES = [
  Buffer.from('4d5a', 'hex'), // MZ
  Buffer.from('7f454c46', 'hex'), // ELF
  Buffer.from('cafebabe', 'hex'), // Mach-O (fat)
  Buffer.from('feedface', 'hex'), // Mach-O
];

function extensionFromMime(type: string) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'jpg';
}

function matchesSignature(header: Buffer, signature: Buffer) {
  return header.subarray(0, signature.length).equals(signature);
}

function detectMimeFromMagicBytes(bytes: Buffer): string | null {
  const header = bytes.subarray(0, MAX_SIGNATURE_BYTES);
  if (matchesSignature(header, Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (matchesSignature(header, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (matchesSignature(header, Buffer.from('474946383761', 'hex')) || matchesSignature(header, Buffer.from('474946383961', 'hex'))) return 'image/gif';
  const riff = header.subarray(0, 4).toString('ascii') === 'RIFF';
  const webp = header.subarray(8, 12).toString('ascii') === 'WEBP';
  if (riff && webp) return 'image/webp';
  return null;
}

function hasExecutableSignature(bytes: Buffer): boolean {
  const header = bytes.subarray(0, MAX_SIGNATURE_BYTES);
  return EXECUTABLE_SIGNATURES.some((sig) => matchesSignature(header, sig));
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

    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'Image is too large', maxImageUploadMb: settings.maxImageUploadMb }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedMime = detectMimeFromMagicBytes(bytes);
    if (!detectedMime || !ALLOWED_TYPES.has(detectedMime) || !ALLOWED_TYPES.has(file.type) || detectedMime !== file.type) {
      return NextResponse.json({ error: 'Unsupported or invalid image type' }, { status: 400 });
    }
    if (hasExecutableSignature(bytes)) {
      return NextResponse.json({ error: 'Executable content is not allowed' }, { status: 400 });
    }

    const extension = extensionFromMime(detectedMime);
    const filename = `${randomUUID()}-${Date.now().toString(36)}.${extension}`;

    await saveSocialImage(filename, bytes);
    return NextResponse.json({ ok: true, imageUrl: getSocialImagePublicUrl(filename), optimizedBytes: bytes.length });
  } catch (error) {
    console.error('social upload POST failed', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
