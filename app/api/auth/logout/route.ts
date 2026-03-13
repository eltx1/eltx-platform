import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { cookieNames, googleBrowserCookieOptions, googleCookieOptions, hasAuthUpstream, proxyToAuthUpstream, sessionCookieOptions } from '../_lib';
import { getDb } from '../../../lib/db.server';

export async function POST(request: Request) {
  if (hasAuthUpstream()) return proxyToAuthUpstream(request, '/auth/logout');
  const token = cookies().get(cookieNames.session)?.value;
  const browserSession = cookies().get(cookieNames.googleBrowserSession)?.value;

  try {
    const db = getDb();
    if (token) await db.query('DELETE FROM sessions WHERE id=?', [token]);
    if (browserSession) await db.query('DELETE FROM oauth_google_states WHERE browser_session_id=?', [browserSession]);
  } catch (error) {
    console.error('logout cleanup failed', error);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieNames.session, '', { ...sessionCookieOptions, maxAge: 0 });
  response.cookies.set(cookieNames.googleState, '', { ...googleCookieOptions, maxAge: 0 });
  response.cookies.set(cookieNames.googleBrowserSession, '', { ...googleBrowserCookieOptions, maxAge: 0 });
  return response;
}
