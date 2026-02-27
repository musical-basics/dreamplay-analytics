
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSuspectedBot } from '@/lib/botDetection';
import { isAdminIP } from '@/lib/adminIPs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '7d';
    const excludeAdmin = searchParams.get('exclude_admin') === 'true';
    const excludeBots = searchParams.get('exclude_bots') === 'true';

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
            .order('created_at', { ascending: true })
            .limit(50000);

        if (error) throw error;

        // Data is already in chronological order (Oldest -> Newest) for Charts and Iteration logic
        let safeLogs = logs || [];

        // Filter Admin IP
        if (excludeAdmin) {
            safeLogs = safeLogs.filter(log => !isAdminIP(log.ip_address || ''));
        }

        // Filter suspected bots
        if (excludeBots) {
            // First pass: count pages per IP
            const ipPageCounts = new Map<string, number>();
            safeLogs.forEach(log => {
                const ip = log.ip_address || 'unknown';
                ipPageCounts.set(ip, (ipPageCounts.get(ip) || 0) + 1);
            });
            safeLogs = safeLogs.filter(log => {
                const ip = log.ip_address || 'unknown';
                return !isSuspectedBot(ip, ipPageCounts.get(ip) || 0);
            });
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

        // E. Visitor Stats (Derived from safeLogs for consistency)
        // We take the last 1000 logs from the *current filtered view*
        const recentLogs = safeLogs.slice(-1000);

        // Pre-calculate email-to-IP mapping for ALL logs retrieved so far to catch older emails
        const ipToEmailMap = new Map<string, string>();
        safeLogs.forEach(log => {
            if (log.metadata?.email && log.ip_address) {
                ipToEmailMap.set(log.ip_address, log.metadata.email);
            }
        });

        // Fetch manual IP→email mappings and merge (manual takes priority)
        const { data: manualMappings } = await supabase
            .from('ip_email_map')
            .select('ip_address, email');

        (manualMappings || []).forEach((row: { ip_address: string; email: string }) => {
            ipToEmailMap.set(row.ip_address, row.email);
        });

        const visitorMap = new Map<string, { ip: string, count: number, lastPath: string, lastSeen: string, country: string, device: string, email?: string }>();

        recentLogs.forEach(log => {
            const ip = log.ip_address || 'unknown';

            if (!visitorMap.has(ip)) {
                visitorMap.set(ip, {
                    ip,
                    count: 0,
                    lastPath: log.path,
                    lastSeen: log.created_at,
                    country: log.country || 'Unknown',
                    device: log.user_agent ? (log.user_agent.includes('Mac') ? 'Mac' : 'Device') : 'Unknown',
                    email: ipToEmailMap.get(ip)
                });
            }

            // ONLY increment the count if it's a pageview!
            if (log.event_name === 'pageview') {
                visitorMap.get(ip)!.count += 1;
            }
        });

        let visitorStats = Array.from(visitorMap.values()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

        // Re-apply filters to the final visitor list to ensure consistency
        // (the global filters run on full safeLogs, but visitorStats is built from a 1000-log slice)
        if (excludeAdmin) {
            visitorStats = visitorStats.filter(v => !isAdminIP(v.ip));
        }
        if (excludeBots) {
            visitorStats = visitorStats.filter(v => !isSuspectedBot(v.ip, v.count));
        }

        return NextResponse.json({
            liveUsers,
            totalPageviews,
            uniqueVisitors,
            uniquePages,
            chartData,
            recentEvents: safeLogs.slice(-50).reverse(),
            abResults,
            visitorStats
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
                'CDN-Cache-Control': 'no-store',
                'Vercel-CDN-Cache-Control': 'no-store',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
