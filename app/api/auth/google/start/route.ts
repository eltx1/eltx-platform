import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  cookieNames,
  googleBrowserCookieOptions,
  googleConfig,
  googleCookieOptions,
  hasGoogleOAuthConfig,
  storeGoogleState,
} from '../../_lib';

function safePath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const redirectPath = safePath(requestUrl.searchParams.get('redirect'));
  const returnOrigin = requestUrl.searchParams.get('return_origin');

  if (!hasGoogleOAuthConfig()) {
    return NextResponse.redirect(new URL('/login?authError=temporarily_unavailable', requestUrl.origin));
  }

  const browserCookie = cookies().get(cookieNames.googleBrowserSession)?.value || crypto.randomUUID();
  const state = crypto.randomUUID();

  await storeGoogleState({
    state,
    browserSessionId: browserCookie,
    redirectPath,
    returnOrigin,
    mode,
    userAgent: headers().get('user-agent') || '',
    ipAddress: headers().get('x-forwarded-for') || '',
  });

  const authUrl = new URL(googleConfig.authUrl);
  authUrl.searchParams.set('client_id', googleConfig.clientId);
  authUrl.searchParams.set('redirect_uri', googleConfig.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(cookieNames.googleState, state, googleCookieOptions);
  response.cookies.set(cookieNames.googleBrowserSession, browserCookie, googleBrowserCookieOptions);
  return response;
}
