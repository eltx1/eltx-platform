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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');

function pathMatches(pathname: string, candidates: string[]) {
  return candidates.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function authMeUrl(request: NextRequest) {
  if (API_BASE) {
    return `${API_BASE}/auth/me`;
  }

  return `${request.nextUrl.origin}/api/auth/me`;
}

async function hasValidSession(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  try {
    const response = await fetch(authMeUrl(request), {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const actionId = request.headers.get('next-action');
  const pathname = request.nextUrl.pathname;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const isProtectedPath = pathMatches(pathname, PROTECTED_PATH_PREFIXES);
  const isAuthPage = pathMatches(pathname, AUTH_PAGES);

  let isAuthenticated = false;
  if (hasSession && (isProtectedPath || isAuthPage)) {
    isAuthenticated = await hasValidSession(request);
  }

  if ((!hasSession || !isAuthenticated) && isProtectedPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    const response = NextResponse.redirect(loginUrl);
    if (hasSession && !isAuthenticated) {
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  if (isAuthenticated && isAuthPage) {
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
