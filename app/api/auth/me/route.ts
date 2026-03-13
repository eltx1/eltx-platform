import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { cookieNames, findUserBySession, toPublicUser } from '../_lib';

export async function GET() {
  const token = cookies().get(cookieNames.session)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const user = await findUserBySession(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(toPublicUser(user));
  } catch (error) {
    console.error('auth me failed', error);
    return NextResponse.json({ error: 'Auth unavailable' }, { status: 503 });
  }
}
