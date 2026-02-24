import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'dp_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function generateToken(): string {
    const secret = process.env.DASHBOARD_PASS || '';
    return crypto.createHmac('sha256', secret).update('dp_analytics_auth').digest('hex');
}

// POST — login
export async function POST(request: Request) {
    try {
        const { password } = await request.json();
        const correct = process.env.DASHBOARD_PASS;

        if (!correct || password !== correct) {
            return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
        }

        const token = generateToken();
        const response = NextResponse.json({ success: true });

        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: COOKIE_MAX_AGE,
        });

        return response;
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

// DELETE — logout
export async function DELETE() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    return response;
}
