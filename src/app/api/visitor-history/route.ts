
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
            .select('created_at, event_name, path, metadata, country')
            .eq('ip_address', ip)
            .in('event_name', ['pageview', 'page_leave'])
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: true })
            .limit(5000);

        if (error) throw error;

        const safeLogs = logs || [];

        // Separate the two event types
        const pageviews = safeLogs.filter(l => l.event_name === 'pageview');
        const leaveEvents = safeLogs.filter(l => l.event_name === 'page_leave');

        // Extract geo from the most recent pageview that has geo data
        const geoSource = [...pageviews].reverse().find(pv => pv.country || pv.metadata?.city);
        const geo = {
            country: geoSource?.country || null,
            city: geoSource?.metadata?.city || null,
            region: geoSource?.metadata?.region || null,
        };

        // Calculate time on page
        const visits = pageviews.map((pv, i) => {
            let durationSeconds: number | null = null;
            const pvTime = new Date(pv.created_at).getTime();
            const nextPvTime = i < pageviews.length - 1
                ? new Date(pageviews[i + 1].created_at).getTime()
                : Infinity;

            // 1. Look for our explicit "page_leave" event for this specific page visit
            const leaveEvent = leaveEvents.find(l =>
                l.path === pv.path &&
                new Date(l.created_at).getTime() >= pvTime &&
                new Date(l.created_at).getTime() < nextPvTime
            );

            if (leaveEvent && leaveEvent.metadata?.duration_seconds) {
                // Use the exact time captured when they closed the tab!
                durationSeconds = Number(leaveEvent.metadata.duration_seconds);
            } else if (i < pageviews.length - 1) {
                // Fallback: Math between two pageviews
                durationSeconds = Math.round((nextPvTime - pvTime) / 1000);
            }

            // Cap extremely long idle times at 2 hours
            if (durationSeconds !== null && durationSeconds > 7200) durationSeconds = null;

            return {
                path: pv.path,
                visited_at: pv.created_at,
                duration_seconds: durationSeconds,
                metadata: pv.metadata,
            };
        });

        return NextResponse.json({
            visits,
            total_pageviews: pageviews.length,
            first_seen: pageviews.length > 0 ? pageviews[0].created_at : null,
            last_seen: pageviews.length > 0 ? pageviews[pageviews.length - 1].created_at : null,
            geo,
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
