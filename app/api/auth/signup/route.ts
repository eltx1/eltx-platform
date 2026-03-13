import { NextResponse } from 'next/server';

import { cookieNames, createSession, createUserWithPassword, parseUtm, sessionCookieOptions } from '../_lib';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const language = body?.language === 'ar' ? 'ar' : 'en';

    if (!email || !password) {
      return NextResponse.json({ error: { code: 'BAD_INPUT', message: 'Email and password are required' } }, { status: 400 });
    }

    const result = await createUserWithPassword(email, password, language, parseUtm(body));
    const session = await createSession(result.userId);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieNames.session, session, sessionCookieOptions);
    return response;
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: { code: 'USER_EXISTS', message: 'Email already exists' } }, { status: 409 });
    }
    console.error('signup failed', error);
    return NextResponse.json({ error: { code: 'SIGNUP_FAILED', message: 'Unable to sign up now' } }, { status: 500 });
  }
}
