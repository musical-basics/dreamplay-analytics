
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'edge';

const allowedOrigins = [
    'https://dreamplaypianos.com',
    'https://www.dreamplaypianos.com',
    'https://blog.dreamplaypianos.com',
    'https://crowdfund.dreamplaypianos.com'
];

function corsHeaders(origin: string | null): Record<string, string> {
    if (origin && allowedOrigins.includes(origin)) {
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };
    }
    return {};
}

export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin');
    return new NextResponse(null, {
        status: 200,
        headers: corsHeaders(origin),
    });
}

export async function POST(request: Request) {
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin);

    const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
    if (userAgent.includes('bot') || userAgent.includes('spider') || userAgent.includes('crawl')) {
        return NextResponse.json({ ignored: true }, { status: 200, headers });
    }

    try {
        const body = await request.json();
        const { eventName, path, sessionId, metadata } = body;

        const ip_address = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const user_agent = request.headers.get('user-agent');
        const country = request.headers.get('x-vercel-ip-country');

        const { error } = await supabase
            .from('analytics_logs')
            .insert([
                {
                    event_name: eventName,
                    path,
                    session_id: sessionId,
                    metadata,
                    ip_address,
                    user_agent,
                    country,
                },
            ]);

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500, headers });
        }

        return NextResponse.json({ success: true }, { status: 200, headers });
    } catch (error) {
        console.error('Handler error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers });
    }
}
