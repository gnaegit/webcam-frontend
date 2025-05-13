import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Restricted Area"' },
    });
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const [username, password] = auth;

  const validUsername = process.env.APP_USERNAME;
  const validPassword = process.env.APP_PASSWORD;

  if (username === validUsername && password === validPassword) {
    return NextResponse.next();
  }

  return new NextResponse('Invalid credentials', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Restricted Area"' },
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|py).*)'],
};
