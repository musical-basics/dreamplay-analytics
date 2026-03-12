
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
        const { data: logs, error } = await supabase
            .from('analytics_logs')
            .select('ip_address, event_name, path, metadata, country, created_at')
            .in('event_name', ['pageview', 'page_leave'])
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: false })
            .limit(50000);

        if (error) throw error;

        const safeLogs = logs || [];

        // Aggregate per IP
        const visitorMap = new Map<string, {
            ip: string;
            source: string;
            country: string;
            pageHits: number;
            totalTimeSeconds: number;
            pages: Map<string, number>;
        }>();

        safeLogs.forEach(log => {
            const ip = log.ip_address || 'unknown';

            // Parse source
            let entrySource: string | undefined;
            if (log.metadata?.utm_source) {
                entrySource = `${log.metadata.utm_source}${log.metadata.utm_medium ? ` / ${log.metadata.utm_medium}` : ''}`;
            } else if (log.metadata?.referrer) {
                try {
                    const url = new URL(log.metadata.referrer);
                    if (!url.hostname.includes('dreamplaypianos.com')) {
                        entrySource = url.hostname.replace('www.', '');
                    }
                } catch {
                    entrySource = log.metadata.referrer.substring(0, 50);
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
                });
            } else if (entrySource) {
                // Keep overwriting so oldest source wins (logs are newest-first)
                visitorMap.get(ip)!.source = entrySource;
            }

            if (log.event_name === 'pageview') {
                const v = visitorMap.get(ip)!;
                v.pageHits += 1;
                // Track page frequency
                const cleanPath = (log.path || '/').split('?')[0]; // Remove query params for grouping
                v.pages.set(cleanPath, (v.pages.get(cleanPath) || 0) + 1);
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

            return {
                ip: v.ip,
                source: v.source,
                country: v.country,
                pageHits: v.pageHits,
                totalTimeSeconds: v.totalTimeSeconds,
                topPages,
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
