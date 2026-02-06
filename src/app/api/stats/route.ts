
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1. Force Next.js to always fetch fresh data
export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '24h';

    const now = new Date();
    let startTime = new Date();

    if (range === '1h') startTime.setHours(now.getHours() - 1);
    if (range === '24h') startTime.setHours(now.getHours() - 24);
    if (range === '7d') startTime.setDate(now.getDate() - 7);
    if (range === '28d') startTime.setDate(now.getDate() - 28);
    if (range === 'all') startTime = new Date(0);

    try {
        // 2. Fetch Live Users (Active in last 5 mins)
        const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
        const { count: liveUsers } = await supabase
            .from('analytics_logs')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', fiveMinsAgo)
            .not('session_id', 'is', null);

        // 3. Fetch Pageviews
        const { count: pageviews } = await supabase
            .from('analytics_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_name', 'pageview')
            .gt('created_at', startTime.toISOString());

        // 4. Fetch Recent Events
        const { data: events } = await supabase
            .from('analytics_logs')
            .select('id, event_name, path, created_at, country, ip_address, user_agent, session_id')
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: false }) // Newest first
            .limit(50);

        return NextResponse.json({
            users: liveUsers || 0,
            pageviews: pageviews || 0,
            events: events || []
        }, {
            // 5. Extra safety: Cache-Control headers
            headers: {
                'Cache-Control': 'no-store, max-age=0, must-revalidate',
            },
        });

    } catch (error) {
        console.error('Stats Error:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
