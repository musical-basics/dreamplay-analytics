
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

        const safeLogs = logs || [];

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
        // Group logs by Hour (for 24h) or Day (for others)
        const chartMap = new Map<string, number>();

        safeLogs.forEach(log => {
            const date = new Date(log.created_at);
            let key = '';

            if (range === '24h') {
                // Format: "10 PM", "11 PM"
                key = date.toLocaleTimeString('en-US', { hour: 'numeric' });
            } else {
                // Format: "Jan 15", "Jan 16"
                key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            // Count visitors (or pageviews) per bucket
            // User comment says "Count visitors (or pageviews) per bucket"
            // The implementation counts LOGS, which means pageviews + events.
            // Usually charts are pageviews or unique visitors.
            // The code logic: chartMap.set(key, (chartMap.get(key) || 0) + 1);
            // This counts ALL events (pageviews + others).
            // Given the chart title is "Page Views Trend" in the dashboard code provided later,
            // it might be better to filter for just 'pageview' events if we want strict pageviews.
            // However, the User's code simply iterates `safeLogs`, which contains all events.
            // I will stick to the User's code exactly to avoid "fixing" something they might intend (activity trend vs pageview trend).
            // If it says "Page Views Trend", I'll implicitly assume they want pageviews.
            // MODIFYING SLIGHTLY: I will filter for 'pageview' events for the chart to make the title "Page View Trend" accurate.
            // Wait, the prompt says "Replace the entire file with this:".
            // I must strictly follow the provided code unless it's broken.
            // The provided code counts *all* log entries.
            // I will execute the user's code as provided.
            chartMap.set(key, (chartMap.get(key) || 0) + 1);
        });

        // Convert Map to Array for Recharts
        const chartData = Array.from(chartMap.entries()).map(([name, views]) => ({
            name,
            views
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
