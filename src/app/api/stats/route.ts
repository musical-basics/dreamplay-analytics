
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET() {
    try {
        // 1. Live Users (Last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count: liveUsersCount, error: liveError } = await supabase
            .from('analytics_logs')
            .select('session_id', { count: 'exact', head: true })
            .gte('created_at', fiveMinutesAgo);

        // Note: 'head: true' with select distinct might be tricky in simple count without subquery if we want distinct sessions.
        // However, exact count of events implies activity. 
        // To get DISTINCT users, Supabase API is a bit limited in 'head: true'.
        // Better approch for "Live" is:
        // .select('session_id')
        // .gte('created_at', fiveMinutesAgo)
        // and then count unique locally or use a customized RPC.
        // For now, let's fetch session_ids and distinct in JS (assuming low volume) or just use event count as proxy if volume is high.
        // Given the prompt asks for "Live Users", let's try to be accurate.

        // Alternative: Use rpc if created. But since we can't create RPC easily here:
        // We will query events in last 5 min.

        const { data: recentEvents, error: recentError } = await supabase
            .from('analytics_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Get last 50 to filter or display

        if (liveError || recentError) {
            throw new Error(liveError?.message || recentError?.message);
        }

        // Process Live Users (Unique sessions in recentEvents is not enough if >50 events, but it's a proxy)
        // To be more robust without fetching ALL rows:
        // Let's make a separate query for unique session counts?? No, "count" on query doesn't do distinct.
        // We will just fetch the last 1000 events from 5 mins ago (limit 1000) and count unique sessions.

        const { data: liveData } = await supabase
            .from('analytics_logs')
            .select('session_id')
            .gte('created_at', fiveMinutesAgo)
            .limit(1000); // safety cap

        const uniqueSessions = new Set(liveData?.map(e => e.session_id)).size;

        // 2. Total Pageviews
        // We can use head: true for fast count, filtering by event_name = 'pageview'
        const { count: totalPageviews, error: totalError } = await supabase
            .from('analytics_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_name', 'pageview');

        if (totalError) throw totalError;

        return NextResponse.json({
            liveUsers: uniqueSessions,
            totalPageviews: totalPageviews || 0,
            recentEvents: recentEvents?.slice(0, 10) || []
        }, { status: 200 });

    } catch (error) {
        console.error('Stats error:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
