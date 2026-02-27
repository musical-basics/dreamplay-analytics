
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

    try {
        // 1. Call the RPC function for aggregated summary (tiny response ~2KB)
        const { data: summary, error: rpcError } = await supabase.rpc('get_analytics_summary', {
            p_range: range,
            p_exclude_admin: excludeAdmin,
            p_exclude_bots: excludeBots,
        });

        if (rpcError) throw rpcError;

        // 2. Fetch recent events (just 50 rows — tiny query)
        let recentQuery = supabase
            .from('analytics_logs')
            .select('id, created_at, event_name, path, ip_address, country, session_id, user_agent, metadata')
            .order('created_at', { ascending: false })
            .limit(50);

        if (excludeAdmin) {
            const { ADMIN_IPS } = await import('@/lib/adminIPs');
            for (const ip of ADMIN_IPS) {
                recentQuery = recentQuery.neq('ip_address', ip);
            }
        }
        if (excludeBots) {
            recentQuery = recentQuery.neq('ip_address', '::1').neq('ip_address', '127.0.0.1');
        }

        const { data: recentEvents } = await recentQuery;

        // 3. Fetch visitor stats (last 1000 rows — small query for the Visitors tab)
        let visitorQuery = supabase
            .from('analytics_logs')
            .select('created_at, event_name, path, ip_address, country, user_agent, metadata')
            .order('created_at', { ascending: false })
            .limit(1000);

        if (excludeAdmin) {
            const { ADMIN_IPS } = await import('@/lib/adminIPs');
            for (const ip of ADMIN_IPS) {
                visitorQuery = visitorQuery.neq('ip_address', ip);
            }
        }
        if (excludeBots) {
            visitorQuery = visitorQuery.neq('ip_address', '::1').neq('ip_address', '127.0.0.1');
        }

        const { data: visitorLogs } = await visitorQuery;
        const safeVisitorLogs = visitorLogs || [];

        // Pre-calculate email-to-IP mapping from these logs + manual mappings
        const ipToEmailMap = new Map<string, string>();
        safeVisitorLogs.forEach(log => {
            if (log.metadata?.email && log.ip_address) {
                ipToEmailMap.set(log.ip_address, log.metadata.email);
            }
        });

        // Fetch manual IP→email mappings (manual takes priority)
        const { data: manualMappings } = await supabase
            .from('ip_email_map')
            .select('ip_address, email');

        (manualMappings || []).forEach((row: { ip_address: string; email: string }) => {
            ipToEmailMap.set(row.ip_address, row.email);
        });

        // Build visitor map
        const visitorMap = new Map<string, { ip: string, count: number, lastPath: string, lastSeen: string, country: string, device: string, email?: string }>();

        safeVisitorLogs.forEach(log => {
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

            if (log.event_name === 'pageview') {
                visitorMap.get(ip)!.count += 1;
            }
        });

        let visitorStats = Array.from(visitorMap.values()).sort((a, b) =>
            new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
        );

        // Re-apply filters
        if (excludeAdmin) {
            visitorStats = visitorStats.filter(v => !isAdminIP(v.ip));
        }
        if (excludeBots) {
            visitorStats = visitorStats.filter(v => !isSuspectedBot(v.ip, v.count));
        }

        // 4. Return same JSON shape as /api/stats
        return NextResponse.json({
            liveUsers: summary.live_users,
            totalPageviews: summary.total_pageviews,
            uniqueVisitors: summary.unique_visitors,
            uniquePages: summary.unique_pages,
            chartData: summary.chart_data,
            recentEvents: recentEvents || [],
            abResults: summary.ab_results,
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
        console.error('stats-v2 error:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
