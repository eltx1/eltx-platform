import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  consumeGoogleState,
  cookieNames,
  createSession,
  googleBrowserCookieOptions,
  googleCookieOptions,
  linkOrCreateGoogleUser,
  resolveGoogleUser,
  sessionCookieOptions,
  hasAuthUpstream,
  upstreamAuthUrl,
} from '../../_lib';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (hasAuthUpstream()) {
    const target = upstreamAuthUrl('/auth/google/callback', requestUrl);
    target.search = requestUrl.search;
    return NextResponse.redirect(target);
  }
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const state = requestUrl.searchParams.get('state') || cookies().get(cookieNames.googleState)?.value || '';
  const browserSession = cookies().get(cookieNames.googleBrowserSession)?.value || '';

  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/login?authError=${encodeURIComponent(reason)}`, requestUrl.origin));
    response.cookies.set(cookieNames.googleState, '', { ...googleCookieOptions, maxAge: 0 });
    response.cookies.set(cookieNames.googleBrowserSession, '', { ...googleBrowserCookieOptions, maxAge: 0 });
    return response;
  };

  if (error) return fail(error);
  if (!code || !state) return fail('oauth_session_expired');

  const consumed = await consumeGoogleState(state, browserSession);
  if (!consumed) return fail('oauth_session_expired');

  const profile = await resolveGoogleUser(code);
  if (!profile) return fail('temporarily_unavailable');

  const userId = await linkOrCreateGoogleUser(profile);
  if (!userId) return fail('temporarily_unavailable');

  const session = await createSession(userId);
  const redirectPath = consumed.redirect_path && String(consumed.redirect_path).startsWith('/') ? String(consumed.redirect_path) : '/dashboard';

  const response = NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
  response.cookies.set(cookieNames.session, session, sessionCookieOptions);
  response.cookies.set(cookieNames.googleState, '', { ...googleCookieOptions, maxAge: 0 });
  return response;
}
