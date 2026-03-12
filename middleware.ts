import { NextRequest, NextResponse } from 'next/server';

const ACTION_ID_PATTERN = /^[A-Za-z0-9/_-]{16,}$/;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';

const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/wallet',
  '/messages',
  '/transactions',
  '/trade',
  '/staking',
  '/premium',
  '/monetize',
  '/pay',
  '/kyc',
  '/settings',
  '/profile',
  '/referrals',
  '/earn',
  '/support',
  '/for-you',
  '/posts/new',
  '/p2p',
  '/ai',
];

const AUTH_PAGES = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const actionId = request.headers.get('next-action');
  const pathname = request.nextUrl.pathname;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSession && PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && AUTH_PAGES.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

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
