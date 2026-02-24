import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'dp_auth';

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
    '/api/track',
    '/api/decide',
    '/api/auth',
    '/login',
];

// Static / internal paths to skip entirely
const SKIP_PREFIXES = [
    '/_next',
    '/favicon.ico',
    '/tracker.js',
];

function isPublic(pathname: string): boolean {
    return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

function shouldSkip(pathname: string): boolean {
    return SKIP_PREFIXES.some(p => pathname.startsWith(p));
}

// Edge-compatible HMAC-SHA256 using Web Crypto API
async function verifyToken(token: string): Promise<boolean> {
    const secret = process.env.DASHBOARD_PASS || '';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('dp_analytics_auth'));
    const expected = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return token === expected;
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static assets and public routes
    if (shouldSkip(pathname) || isPublic(pathname)) {
        return NextResponse.next();
    }

    // Check auth cookie
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token || !(await verifyToken(token))) {
        // API routes → 401 JSON
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Page routes → redirect to /login
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
