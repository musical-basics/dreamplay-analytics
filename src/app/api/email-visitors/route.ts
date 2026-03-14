
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

// Email repo Supabase client (for cross-referencing subscriber tags)
const emailSupabase = process.env.EMAIL_SUPABASE_URL && process.env.EMAIL_SUPABASE_SERVICE_KEY
    ? createClient(process.env.EMAIL_SUPABASE_URL, process.env.EMAIL_SUPABASE_SERVICE_KEY)
    : null;

const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0',
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const excludeAdmin = searchParams.get('exclude_admin') === 'true';
    const excludeBots = searchParams.get('exclude_bots') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000', 10) || 1000, 5000);

    try {
        // 1. Gather ALL IPs that have an associated email

        // Source A: manual ip_email_map table
        const { data: manualMappings } = await supabase
            .from('ip_email_map')
            .select('ip_address, email');

        const ipToEmailMap = new Map<string, string>();
        (manualMappings || []).forEach((row: { ip_address: string; email: string }) => {
            ipToEmailMap.set(row.ip_address, row.email);
        });

        // Source B: analytics_logs metadata.email (scan recent logs)
        // We fetch the most recent logs that have an email in metadata
        const { data: emailLogs } = await supabase
            .from('analytics_logs')
            .select('ip_address, metadata')
            .not('metadata->email', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5000);

        (emailLogs || []).forEach((log: { ip_address: string; metadata: { email?: string } }) => {
            if (log.metadata?.email && log.ip_address && !ipToEmailMap.has(log.ip_address)) {
                ipToEmailMap.set(log.ip_address, log.metadata.email);
            }
        });

        // Filter out admin IPs from the email map itself
        if (excludeAdmin) {
            for (const ip of Array.from(ipToEmailMap.keys())) {
                if (isAdminIP(ip)) ipToEmailMap.delete(ip);
            }
        }

        const emailIPs = Array.from(ipToEmailMap.keys());

        if (emailIPs.length === 0) {
            return NextResponse.json({ emailVisitorStats: [] }, { headers: noCacheHeaders });
        }

        // 2. Fetch the last 1000 events for ONLY these IPs
        const { data: logs, error } = await supabase
            .from('analytics_logs')
            .select('id, created_at, event_name, path, ip_address, country, session_id, user_agent, metadata')
            .in('ip_address', emailIPs)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        let safeLogs = logs || [];

        // Filter admin IPs from logs
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

        // 3. Build visitor stats from these logs
        const visitorMap = new Map<string, {
            ip: string;
            count: number;
            lastPath: string;
            lastSeen: string;
            country: string;
            device: string;
            email: string;
            purchased: boolean;
            source?: string;
            sourceUrl?: string;
            journey_id?: string;
        }>();

        // Logs are newest-first, so first occurrence = most recent
        safeLogs.forEach(log => {
            const ip = log.ip_address || 'unknown';
            const email = ipToEmailMap.get(ip);
            if (!email) return; // safety check

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
                    device: (() => {
                        const ua = log.user_agent || '';
                        if (!ua) return 'Unknown';
                        if (/bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot/i.test(ua)) return 'Bot';
                        if (/iPad|tablet|Kindle|Silk|PlayBook/i.test(ua)) return 'Tablet';
                        if (/Mobile|iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return 'Mobile';
                        return 'Desktop';
                    })(),
                    email,
                    purchased: false,
                    source: entrySource,
                    sourceUrl: entrySourceUrl,
                    journey_id: log.metadata?.journey_id || undefined,
                });
            } else if (entrySource) {
                // Logs are newest-first; keep overwriting so oldest source wins
                visitorMap.get(ip)!.source = entrySource;
                if (entrySourceUrl) visitorMap.get(ip)!.sourceUrl = entrySourceUrl;
            }

            // Keep most recent journey_id
            if (log.metadata?.journey_id && !visitorMap.get(ip)!.journey_id) {
                visitorMap.get(ip)!.journey_id = log.metadata.journey_id;
            }

            if (log.event_name === 'pageview') {
                visitorMap.get(ip)!.count += 1;
            }
        });

        // 4. Cross-reference with email repo DB for "Purchased" tag
        if (emailSupabase) {
            try {
                const uniqueEmails = Array.from(new Set(Array.from(visitorMap.values()).map(v => v.email)));

                if (uniqueEmails.length > 0) {
                    const { data: subscribers } = await emailSupabase
                        .from('subscribers')
                        .select('id, email, tags')
                        .in('email', uniqueEmails);

                    if (subscribers) {
                        const purchasedEmails = new Set<string>();
                        const subscribersToTag: { id: string; tags: string[] }[] = [];

                        subscribers.forEach((sub: { id: string; email: string; tags: string[] | null }) => {
                            if (sub.tags && sub.tags.includes('Purchased')) {
                                purchasedEmails.add(sub.email);
                            }
                            // If subscriber doesn't already have the tag, queue them for tagging
                            const currentTags = sub.tags || [];
                            if (!currentTags.includes('IP Email Connected')) {
                                subscribersToTag.push({ id: sub.id, tags: [...currentTags, 'IP Email Connected'] });
                            }
                        });

                        // Mark purchased visitors
                        visitorMap.forEach(visitor => {
                            if (purchasedEmails.has(visitor.email)) {
                                visitor.purchased = true;
                            }
                        });

                        // Apply "IP Email Connected" tag to subscribers who don't have it yet
                        if (subscribersToTag.length > 0) {
                            const tagPromises = subscribersToTag.map(sub =>
                                emailSupabase
                                    .from('subscribers')
                                    .update({ tags: sub.tags })
                                    .eq('id', sub.id)
                            );
                            await Promise.all(tagPromises);
                            console.log(`[Email Visitors API] Tagged ${subscribersToTag.length} subscriber(s) with "IP Email Connected"`);
                        }
                    }
                }
            } catch (emailErr) {
                console.error('[Email Visitors API] Failed to fetch subscriber tags:', emailErr);
                // Non-fatal: continue without purchased info
            }
        }

        const emailVisitorStats = Array.from(visitorMap.values())
            .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

        return NextResponse.json({ emailVisitorStats }, { headers: noCacheHeaders });

    } catch (error) {
        console.error('[Email Visitors API] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch email visitors' }, { status: 500, headers: noCacheHeaders });
    }
}

