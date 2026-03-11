
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
    const visitorLimit = Math.min(parseInt(searchParams.get('visitor_limit') || '1000', 10) || 1000, 5000);

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
            .limit(visitorLimit);

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
        const visitorMap = new Map<string, { ip: string, count: number, lastPath: string, lastSeen: string, country: string, device: string, email?: string, source?: string, sourceUrl?: string }>();

        safeVisitorLogs.forEach(log => {
            const ip = log.ip_address || 'unknown';

            // Parse traffic source from metadata
            let entrySource: string | undefined = undefined;
            let entrySourceUrl: string | undefined = undefined;
            if (log.metadata?.utm_source) {
                entrySource = `${log.metadata.utm_source}${log.metadata.utm_medium ? ` / ${log.metadata.utm_medium}` : ''}`;
            } else if (log.metadata?.referrer) {
                try {
                    const url = new URL(log.metadata.referrer);
                    if (!url.hostname.includes('dreamplaypianos.com')) {
                        entrySource = url.hostname.replace('www.', '');
                        entrySourceUrl = log.metadata.referrer;
                    }
                } catch {
                    entrySource = log.metadata.referrer.substring(0, 30);
                }
            }

            if (!visitorMap.has(ip)) {
                visitorMap.set(ip, {
                    ip,
                    count: 0,
                    lastPath: log.path,
                    lastSeen: log.created_at,
                    country: log.country || 'Unknown',
                    device: log.user_agent ? (log.user_agent.includes('Mac') ? 'Mac' : 'Device') : 'Unknown',
                    email: ipToEmailMap.get(ip),
                    source: entrySource,
                    sourceUrl: entrySourceUrl
                });
            } else if (entrySource) {
                // Logs are newest-first; keep overwriting so oldest source wins
                visitorMap.get(ip)!.source = entrySource;
                if (entrySourceUrl) visitorMap.get(ip)!.sourceUrl = entrySourceUrl;
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

        // 4. Compute Checkout A/B Test Results from analytics_logs
        // Visitors: count distinct IPs with checkout_ab metadata
        const checkoutAbVisitors = new Map<string, Set<string>>();
        safeVisitorLogs.forEach(log => {
            const abBucket = log.metadata?.checkout_ab;
            if (abBucket && log.ip_address) {
                if (!checkoutAbVisitors.has(abBucket)) {
                    checkoutAbVisitors.set(abBucket, new Set());
                }
                checkoutAbVisitors.get(abBucket)!.add(log.ip_address);
            }
        });

        // Purchases: query purchase events with checkout_source
        const { data: purchaseEvents } = await supabase
            .from('analytics_logs')
            .select('metadata')
            .eq('event_name', 'purchase')
            .not('metadata->checkout_source', 'is', null);

        const purchaseCounts = new Map<string, number>();
        (purchaseEvents || []).forEach((evt: any) => {
            const source = evt.metadata?.checkout_source;
            if (source) {
                // Map "pdp" -> "checkout", keep "customize" as is
                const bucket = source === 'pdp' ? 'checkout' : source;
                purchaseCounts.set(bucket, (purchaseCounts.get(bucket) || 0) + 1);
            }
        });

        // Build abResults array
        const abResults = ['checkout', 'customize'].map(variant => {
            const visitors = checkoutAbVisitors.get(variant)?.size || 0;
            const conversions = purchaseCounts.get(variant) || 0;
            const conversionRate = visitors > 0 ? ((conversions / visitors) * 100).toFixed(2) : '0.00';
            return {
                variant,
                label: variant === 'checkout' ? 'PDP (Product Detail Page)' : 'Customize Wizard',
                visitors,
                conversions,
                conversion_rate: conversionRate,
            };
        });

        // 5. Return same JSON shape as /api/stats
        return NextResponse.json({
            liveUsers: summary.live_users,
            totalPageviews: summary.total_pageviews,
            uniqueVisitors: summary.unique_visitors,
            uniquePages: summary.unique_pages,
            chartData: summary.chart_data,
            recentEvents: recentEvents || [],
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
        console.error('stats-v2 error:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
