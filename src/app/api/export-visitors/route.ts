
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isAdminIP } from '@/lib/adminIPs';

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
    const startTime = new Date();

    if (range === '1d') startTime.setHours(now.getHours() - 24);
    else if (range === '3d') startTime.setDate(now.getDate() - 3);
    else if (range === '7d') startTime.setDate(now.getDate() - 7);
    else if (range === '14d') startTime.setDate(now.getDate() - 14);
    else if (range === '30d') startTime.setDate(now.getDate() - 30);
    else startTime.setDate(now.getDate() - 7);

    try {
        // Supabase has a default row limit (~1000). Paginate to get all data.
        const PAGE_SIZE = 1000;
        let allLogs: any[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
            const { data: logs, error } = await supabase
                .from('analytics_logs')
                .select('ip_address, event_name, path, metadata, country, created_at')
                .in('event_name', ['pageview', 'page_leave'])
                .gt('created_at', startTime.toISOString())
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (error) throw error;

            const rows = logs || [];
            allLogs = allLogs.concat(rows);
            hasMore = rows.length === PAGE_SIZE;
            page++;

            // Safety cap at 50 pages (50k rows)
            if (page >= 50) break;
        }

        const safeLogs = allLogs;

        // Aggregate per IP
        const visitorMap = new Map<string, {
            ip: string;
            source: string;
            country: string;
            pageHits: number;
            totalTimeSeconds: number;
            pages: Map<string, number>;
            rawPaths: string[];
            email: string;
            firstVisitAt: string;
        }>();

        safeLogs.forEach(log => {
            const ip = log.ip_address || 'unknown';

            // Keep raw source — full referrer URL or UTM params
            let entrySource: string | undefined;
            if (log.metadata?.utm_source) {
                entrySource = `utm_source=${log.metadata.utm_source}${log.metadata.utm_medium ? `&utm_medium=${log.metadata.utm_medium}` : ''}${log.metadata.utm_campaign ? `&utm_campaign=${log.metadata.utm_campaign}` : ''}`;
            } else if (log.metadata?.referrer) {
                const ref = String(log.metadata.referrer);
                try {
                    const url = new URL(ref);
                    if (!url.hostname.includes('dreamplaypianos.com')) {
                        entrySource = ref;
                    }
                } catch {
                    entrySource = ref;
                }
            }

            if (!visitorMap.has(ip)) {
                visitorMap.set(ip, {
                    ip,
                    source: entrySource || 'Direct',
                    country: log.country || 'Unknown',
                    pageHits: 0,
                    totalTimeSeconds: 0,
                    pages: new Map(),
                    rawPaths: [],
                    email: log.metadata?.email || '',
                    firstVisitAt: log.created_at || '',
                });
            } else {
                if (entrySource) {
                    // Keep overwriting so oldest source wins (logs are newest-first)
                    visitorMap.get(ip)!.source = entrySource;
                }
                // Logs are newest-first, so keep overwriting to get oldest timestamp
                if (log.created_at) visitorMap.get(ip)!.firstVisitAt = log.created_at;
            }

            if (log.event_name === 'pageview') {
                const v = visitorMap.get(ip)!;
                v.pageHits += 1;
                // Track page frequency
                const cleanPath = (log.path || '/').split('?')[0]; // Remove query params for grouping
                v.pages.set(cleanPath, (v.pages.get(cleanPath) || 0) + 1);
                // Store full raw path (with SID/CID query params) for debugging
                if (log.path) v.rawPaths.push(log.path);
                // Capture email if found later
                if (!v.email && log.metadata?.email) v.email = log.metadata.email;
            }

            if (log.event_name === 'page_leave' && log.metadata?.duration_seconds) {
                const dur = Number(log.metadata.duration_seconds);
                if (!isNaN(dur) && dur > 0 && dur < 3600) {
                    visitorMap.get(ip)!.totalTimeSeconds += dur;
                }
            }
        });

        // Filter admin IPs
        let visitors = Array.from(visitorMap.values());
        if (excludeAdmin) {
            visitors = visitors.filter(v => !isAdminIP(v.ip));
        }

        // Sort by page hits descending
        visitors.sort((a, b) => b.pageHits - a.pageHits);

        // Build export rows
        const rows = visitors.map(v => {
            // Top 5 pages by hit count
            const topPages = Array.from(v.pages.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([path, count]) => `${path} (${count})`)
                .join(' | ');

            // Get the last visited page with full query params (most recent = first in rawPaths since logs are newest-first)
            const lastVisitedRaw = v.rawPaths[0] || '—';

            return {
                ip: v.ip,
                email: v.email || '',
                firstVisitAt: v.firstVisitAt || '',
                source: v.source,
                country: v.country,
                pageHits: v.pageHits,
                totalTimeSeconds: v.totalTimeSeconds,
                topPages,
                lastVisitedRaw,
            };
        });

        return NextResponse.json({ rows, total: rows.length }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, max-age=0',
            },
        });
    } catch (error) {
        console.error('[Export API] Error:', error);
        return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
    }
}
