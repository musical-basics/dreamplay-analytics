
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

// Checkout pages — a visitor who reached any of these is a "converter"
const CHECKOUT_PATTERNS = [
    '/checkout-pages/buy-product',
    '/checkout-pages/customize',
    'crowdfund.dreamplaypianos.com',
];

function isCheckoutPage(path: string): boolean {
    return CHECKOUT_PATTERNS.some(p => path.includes(p));
}

function cleanPagePath(rawPath: string): string {
    try {
        const url = new URL(rawPath);
        // For external domains (crowdfund), show domain + path
        if (!url.hostname.includes('dreamplaypianos.com') || url.hostname === 'crowdfund.dreamplaypianos.com') {
            return url.hostname + url.pathname;
        }
        return url.pathname || '/';
    } catch {
        return rawPath;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '7d';
    const excludeAdmin = searchParams.get('exclude_admin') === 'true';
    const excludeBots = searchParams.get('exclude_bots') === 'true';

    const now = new Date();
    let startTime = new Date();

    if (range === '24h') startTime.setHours(now.getHours() - 24);
    if (range === '7d') startTime.setDate(now.getDate() - 7);
    if (range === '30d') startTime.setDate(now.getDate() - 30);
    if (range === 'all') startTime = new Date(0);

    try {
        const { data: logs, error } = await supabase
            .from('analytics_logs')
            .select('created_at, event_name, path, ip_address, session_id')
            .eq('event_name', 'pageview')
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: true })
            .limit(20000);

        if (error) throw error;

        let safeLogs = logs || [];

        if (excludeAdmin) {
            safeLogs = safeLogs.filter(log => !isAdminIP(log.ip_address || ''));
        }

        // Filter suspected bots
        if (excludeBots) {
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

        // ============================
        // Group pageviews by visitor (IP)
        // ============================
        const visitorMap = new Map<string, typeof safeLogs>();
        safeLogs.forEach(log => {
            const key = log.ip_address || log.session_id || 'unknown';
            if (!visitorMap.has(key)) visitorMap.set(key, []);
            visitorMap.get(key)!.push(log);
        });

        // ============================
        // 1. PATH TO PURCHASE — pages converters visited before checkout
        // ============================
        const converterIPs = new Set<string>();
        const pageFrequencyAmongConverters = new Map<string, number>();
        const converterJourneys: string[][] = [];
        let converterTotalPages = 0;
        let converterTotalDuration = 0;
        let converterSessionCount = 0;

        visitorMap.forEach((visits, ip) => {
            const reachedCheckout = visits.some(v => isCheckoutPage(v.path));
            if (!reachedCheckout) return;

            converterIPs.add(ip);
            converterSessionCount++;
            converterTotalPages += visits.length;

            // Calculate session duration
            if (visits.length >= 2) {
                const first = new Date(visits[0].created_at).getTime();
                const last = new Date(visits[visits.length - 1].created_at).getTime();
                const durationSec = (last - first) / 1000;
                if (durationSec < 7200) { // Cap at 2 hours
                    converterTotalDuration += durationSec;
                }
            }

            // Track which pages they visited (deduplicated per visitor)
            const uniquePages = new Set<string>();
            const journey: string[] = [];

            visits.forEach(v => {
                const cleanPath = cleanPagePath(v.path);
                journey.push(cleanPath);
                uniquePages.add(cleanPath);
            });

            uniquePages.forEach(page => {
                pageFrequencyAmongConverters.set(page, (pageFrequencyAmongConverters.get(page) || 0) + 1);
            });

            converterJourneys.push(journey);
        });

        const totalConverters = converterIPs.size;

        // Sort pages by frequency among converters, exclude checkout pages themselves
        const pagesBeforePurchase = Array.from(pageFrequencyAmongConverters.entries())
            .filter(([page]) => !CHECKOUT_PATTERNS.some(p => page.includes(p.replace('https://', ''))))
            .map(([page, count]) => ({
                page,
                converterCount: count,
                percentage: totalConverters > 0 ? Math.round((count / totalConverters) * 100) : 0,
            }))
            .sort((a, b) => b.converterCount - a.converterCount)
            .slice(0, 15);

        // ============================
        // 2. PAGE ENGAGEMENT STATS — per-page metrics for ALL visitors
        // ============================
        const pageStats = new Map<string, {
            views: number;
            visitors: Set<string>;
            totalDuration: number;
            durationCount: number;
            exitCount: number;
        }>();

        let totalSessions = 0;

        visitorMap.forEach((visits, ip) => {
            totalSessions++;

            visits.forEach((v, i) => {
                const cleanPath = cleanPagePath(v.path);

                if (!pageStats.has(cleanPath)) {
                    pageStats.set(cleanPath, {
                        views: 0,
                        visitors: new Set(),
                        totalDuration: 0,
                        durationCount: 0,
                        exitCount: 0,
                    });
                }

                const stats = pageStats.get(cleanPath)!;
                stats.views++;
                stats.visitors.add(ip);

                // Time on page = diff to next pageview
                if (i < visits.length - 1) {
                    const current = new Date(v.created_at).getTime();
                    const next = new Date(visits[i + 1].created_at).getTime();
                    const dur = (next - current) / 1000;
                    if (dur > 0 && dur <= 1800) { // Cap at 30 min
                        stats.totalDuration += dur;
                        stats.durationCount++;
                    }
                }

                // Exit page = last page in a visitor's sequence
                if (i === visits.length - 1) {
                    stats.exitCount++;
                }
            });
        });

        const pageEngagement = Array.from(pageStats.entries())
            .map(([page, stats]) => ({
                page,
                views: stats.views,
                uniqueVisitors: stats.visitors.size,
                avgTimeSeconds: stats.durationCount > 0 ? Math.round(stats.totalDuration / stats.durationCount) : null,
                exitRate: stats.views > 0 ? Math.round((stats.exitCount / totalSessions) * 100) : 0,
            }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 30);

        // ============================
        // 3. CONVERTER vs ALL VISITOR COMPARISON
        // ============================
        let allTotalPages = 0;
        let allTotalDuration = 0;
        let allSessionCount = 0;

        visitorMap.forEach((visits) => {
            allSessionCount++;
            allTotalPages += visits.length;
            if (visits.length >= 2) {
                const first = new Date(visits[0].created_at).getTime();
                const last = new Date(visits[visits.length - 1].created_at).getTime();
                const durationSec = (last - first) / 1000;
                if (durationSec < 7200) {
                    allTotalDuration += durationSec;
                }
            }
        });

        // Find common page flows (top 2-step transitions)
        const transitionCounts = new Map<string, number>();
        converterJourneys.forEach(journey => {
            for (let i = 0; i < journey.length - 1; i++) {
                const transition = `${journey[i]} → ${journey[i + 1]}`;
                transitionCounts.set(transition, (transitionCounts.get(transition) || 0) + 1);
            }
        });

        const topFlows = Array.from(transitionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([flow, count]) => ({ flow, count }));

        return NextResponse.json({
            totalConverters,
            totalVisitors: visitorMap.size,
            conversionRate: visitorMap.size > 0 ? ((totalConverters / visitorMap.size) * 100).toFixed(1) : '0',

            pagesBeforePurchase,
            pageEngagement,
            topFlows,

            converterAvg: {
                pagesPerSession: converterSessionCount > 0 ? (converterTotalPages / converterSessionCount).toFixed(1) : '0',
                sessionDuration: converterSessionCount > 0 ? Math.round(converterTotalDuration / converterSessionCount) : 0,
            },
            allVisitorAvg: {
                pagesPerSession: allSessionCount > 0 ? (allTotalPages / allSessionCount).toFixed(1) : '0',
                sessionDuration: allSessionCount > 0 ? Math.round(allTotalDuration / allSessionCount) : 0,
            },
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
        console.error('[Insights API] Error:', error);
        return NextResponse.json({ error: 'Failed to compute insights' }, { status: 500 });
    }
}
