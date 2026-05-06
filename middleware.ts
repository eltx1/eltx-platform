import { NextRequest, NextResponse } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

function shouldRateLimit(pathname: string) {
  return pathname.startsWith('/api/social/uploads') || pathname.startsWith('/api/social/posts');
}

export function middleware(request: NextRequest) {
  if (shouldRateLimit(request.nextUrl.pathname)) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const current = ipBuckets.get(ip);
    if (!current || current.resetAt <= now) {
      ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      current.count += 1;
      if (current.count > MAX_REQUESTS_PER_WINDOW) {
        return applySecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
      }
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
