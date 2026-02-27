
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
            .limit(1000);

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
        }>();

        // Logs are newest-first, so first occurrence = most recent
        safeLogs.forEach(log => {
            const ip = log.ip_address || 'unknown';
            const email = ipToEmailMap.get(ip);
            if (!email) return; // safety check

            if (!visitorMap.has(ip)) {
                visitorMap.set(ip, {
                    ip,
                    count: 0,
                    lastPath: log.path,
                    lastSeen: log.created_at,
                    country: log.country || 'Unknown',
                    device: log.user_agent ? (log.user_agent.includes('Mac') ? 'Mac' : 'Device') : 'Unknown',
                    email,
                    purchased: false,
                });
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
                        .select('email, tags')
                        .in('email', uniqueEmails);

                    if (subscribers) {
                        const purchasedEmails = new Set<string>();
                        subscribers.forEach((sub: { email: string; tags: string[] | null }) => {
                            if (sub.tags && sub.tags.includes('Purchased')) {
                                purchasedEmails.add(sub.email);
                            }
                        });

                        // Mark purchased visitors
                        visitorMap.forEach(visitor => {
                            if (purchasedEmails.has(visitor.email)) {
                                visitor.purchased = true;
                            }
                        });
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

