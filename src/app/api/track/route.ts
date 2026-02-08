
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// export const runtime = 'edge'; // Removed to use Node.js runtime for better stability

// Initialize Supabase client locally to ensure environment variables are read correctly in this context
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const allowedOrigins = [
    'https://dreamplaypianos.com',
    'https://www.dreamplaypianos.com',
    'https://blog.dreamplaypianos.com',
    'https://crowdfund.dreamplaypianos.com'
];

function corsHeaders(origin: string | null): Record<string, string> {
    // Allow Vercel previews and localhost for testing
    const isAllowed = origin && (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost')
    );

    if (isAllowed) {
        return {
            'Access-Control-Allow-Origin': origin!,
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
    console.log('[Track API] Received request');
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin);

    const userAgent = (request.headers.get('user-agent') || '').toLowerCase();

    // Simplified bot detection - removed overly aggressive terms like 'monitor', 'status'
    const botPatterns = [
        'bot', 'spider', 'crawl', 'headless', 'lighthouse', 'pingdom'
    ];

    if (botPatterns.some(pattern => userAgent.includes(pattern))) {
        console.log('[Track API] Ignored bot:', userAgent);
        return NextResponse.json({ ignored: true }, { status: 200, headers });
    }

    try {
        const body = await request.json();
        const { eventName, path, sessionId, metadata } = body;
        console.log('[Track API] Processing event:', eventName, path);

        // Truncate path to avoid database errors if URL is too long
        const safePath = path ? path.substring(0, 2000) : path;

        const ip_address = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const user_agent = request.headers.get('user-agent');
        const country = request.headers.get('x-vercel-ip-country');

        const { error } = await supabase
            .from('analytics_logs')
            .insert([
                {
                    event_name: eventName,
                    path: safePath,
                    session_id: sessionId,
                    metadata,
                    ip_address,
                    user_agent,
                    country,
                },
            ]);

        if (error) {
            console.error('[Track API] Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500, headers });
        }

        console.log('[Track API] Event recorded successfully');
        return NextResponse.json({ success: true }, { status: 200, headers });
    } catch (error) {
        console.error('[Track API] Handler error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers });
    }
}
