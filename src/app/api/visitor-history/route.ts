
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isAdminIP } from '@/lib/adminIPs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');
    const range = searchParams.get('range') || '7d';
    const excludeAdmin = searchParams.get('exclude_admin') === 'true';

    if (!ip) {
        return NextResponse.json({ error: 'Missing ip parameter' }, { status: 400 });
    }

    // If admin filtering is on and the requested IP is an admin IP, return empty
    if (excludeAdmin && isAdminIP(ip)) {
        return NextResponse.json({ visits: [], total_pageviews: 0, first_seen: null, last_seen: null });
    }

    const now = new Date();
    let startTime = new Date();

    if (range === '24h') startTime.setHours(now.getHours() - 24);
    if (range === '7d') startTime.setDate(now.getDate() - 7);
    if (range === '30d') startTime.setDate(now.getDate() - 30);
    if (range === 'all') startTime = new Date(0);

    try {
        const { data: logs, error } = await supabase
            .from('analytics_logs')
            .select('created_at, event_name, path')
            .eq('ip_address', ip)
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: true })
            .limit(5000);

        if (error) throw error;

        const safeLogs = logs || [];

        // Filter to pageview events only for the visits timeline
        const pageviews = safeLogs.filter(l => l.event_name === 'pageview');

        // Calculate time on page: difference between consecutive pageview timestamps
        const visits = pageviews.map((pv, i) => {
            let durationSeconds: number | null = null;
            if (i < pageviews.length - 1) {
                const current = new Date(pv.created_at).getTime();
                const next = new Date(pageviews[i + 1].created_at).getTime();
                durationSeconds = Math.round((next - current) / 1000);
                // Cap at 30 minutes — longer likely means they left
                if (durationSeconds > 1800) durationSeconds = null;
            }
            return {
                path: pv.path,
                visited_at: pv.created_at,
                duration_seconds: durationSeconds,
            };
        });

        return NextResponse.json({
            visits,
            total_pageviews: pageviews.length,
            first_seen: pageviews.length > 0 ? pageviews[0].created_at : null,
            last_seen: pageviews.length > 0 ? pageviews[pageviews.length - 1].created_at : null,
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
                'CDN-Cache-Control': 'no-store',
                'Vercel-CDN-Cache-Control': 'no-store',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
        });
    } catch (error) {
        console.error('[Visitor History API] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch visitor history' }, { status: 500 });
    }
}
