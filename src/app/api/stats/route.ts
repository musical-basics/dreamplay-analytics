
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '7d';
    const excludeAdmin = searchParams.get('exclude_admin') === 'true';

    const now = new Date();
    let startTime = new Date();

    // 1. Determine Time Range
    if (range === '24h') startTime.setHours(now.getHours() - 24);
    if (range === '7d') startTime.setDate(now.getDate() - 7);
    if (range === '30d') startTime.setDate(now.getDate() - 30);
    if (range === 'all') startTime = new Date(0);

    try {
        // 2. Fetch Logs for the Time Range
        const { data: logs, error } = await supabase
            .from('analytics_logs')
            .select('id, created_at, event_name, path, ip_address, country, session_id, user_agent, metadata')
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: true }); // Ascending for chart

        if (error) throw error;

        let safeLogs = logs || [];

        // Filter Admin IP
        if (excludeAdmin) {
            safeLogs = safeLogs.filter(log => log.ip_address !== '71.38.79.10');
        }

        // --- CALCULATE METRICS ---

        // A. Live Users (Last 5 mins)
        const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).getTime();
        const liveUsers = new Set(
            safeLogs
                .filter(l => new Date(l.created_at).getTime() > fiveMinsAgo)
                .map(l => l.session_id)
        ).size;

        // B. Unique Visitors & Pages (Based on IP or Session)
        const uniqueVisitors = new Set(safeLogs.map(l => l.ip_address || l.session_id)).size;
        const uniquePages = new Set(safeLogs.map(l => l.path)).size;
        const totalPageviews = safeLogs.filter(l => l.event_name === 'pageview').length;

        // C. Process Chart Data
        const chartMap = new Map<string, { visitors: Set<string>, pageviews: number, paths: Set<string> }>();

        safeLogs.forEach(log => {
            const date = new Date(log.created_at);
            let key = '';

            if (range === '24h') {
                key = date.toLocaleTimeString('en-US', { hour: 'numeric' });
            } else {
                key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            if (!chartMap.has(key)) {
                chartMap.set(key, { visitors: new Set(), pageviews: 0, paths: new Set() });
            }
            const entry = chartMap.get(key)!;

            // Visitors (Session ID)
            if (log.session_id) entry.visitors.add(log.session_id);
            else if (log.ip_address) entry.visitors.add(log.ip_address); // Fallback

            // Pageviews (Only count 'pageview' events)
            if (log.event_name === 'pageview') {
                entry.pageviews += 1;
            }

            // Unique Pages (Path)
            if (log.path) entry.paths.add(log.path);
        });

        // Convert Map to Array for Recharts
        const chartData = Array.from(chartMap.entries()).map(([name, data]) => ({
            name,
            visitors: data.visitors.size,
            pageviews: data.pageviews,
            unique_pages: data.paths.size,
            avg_per_user: data.visitors.size > 0 ? parseFloat((data.pageviews / data.visitors.size).toFixed(1)) : 0
        }));

        // D. A/B Test Data (Calculated in-memory for simplicity)
        const abEvents = safeLogs.filter(l => l.metadata?.variant);
        const variants = new Set(abEvents.map(l => l.metadata.variant));
        const abResults = Array.from(variants).map(variant => {
            const variantLogs = abEvents.filter(l => l.metadata.variant === variant);
            // "experiment_view" is a common event name for seeing a variant
            const visitors = new Set(variantLogs.filter(l => l.event_name === 'experiment_view').map(l => l.session_id)).size;
            const conversions = new Set(variantLogs.filter(l => l.event_name === 'conversion' || l.event_name === 'click_preorder').map(l => l.session_id)).size;

            return {
                variant,
                visitors,
                conversions,
                conversion_rate: visitors > 0 ? ((conversions / visitors) * 100).toFixed(1) : 0
            };
        });

        return NextResponse.json({
            liveUsers,
            totalPageviews,
            uniqueVisitors,
            uniquePages,
            chartData,
            recentEvents: safeLogs.slice().reverse().slice(0, 50), // Last 50 events, newest first
            abResults
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
