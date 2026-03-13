import { NextResponse } from 'next/server';

import { cookieNames, createSession, hasAuthUpstream, loginByEmailPassword, proxyToAuthUpstream, sessionCookieOptions } from '../_lib';

export async function POST(request: Request) {
  if (hasAuthUpstream()) return proxyToAuthUpstream(request, '/auth/login');

  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ error: { code: 'BAD_INPUT', message: 'Email and password are required' } }, { status: 400 });
    }

    const user = await loginByEmailPassword(email, password);
    if (!user) {
      return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }, { status: 401 });
    }

    const session = await createSession(Number(user.id));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieNames.session, session, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error('login failed', error);
    return NextResponse.json({ error: { code: 'LOGIN_FAILED', message: 'Unable to sign in now' } }, { status: 500 });
  }
}
