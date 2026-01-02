import { NextRequest, NextResponse } from 'next/server';

const ACTION_ID_PATTERN = /^[A-Za-z0-9/_-]{16,}$/;

export function middleware(request: NextRequest) {
  const actionId = request.headers.get('next-action');

  if (actionId && !ACTION_ID_PATTERN.test(actionId)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'STALE_CLIENT_ACTION',
          message: 'Your session is using an outdated build. Please hard refresh the page and try again.',
        },
      },
      {
        status: 409,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
