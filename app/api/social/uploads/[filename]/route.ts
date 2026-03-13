import { NextResponse } from 'next/server';
import { readSocialImage, resolveSocialImageFilename } from '../../../../lib/social-image-storage';

type Context = {
  params: {
    filename: string;
  };
};

export async function GET(_request: Request, context: Context) {
  const filename = resolveSocialImageFilename(context.params.filename);
  if (!filename) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const image = await readSocialImage(filename);
  if (!image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  return new NextResponse(image.bytes, {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
