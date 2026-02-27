import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isAdminIP } from '@/lib/adminIPs';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List recent chat sessions
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const excludeAdmin = searchParams.get('exclude_admin') === 'true';

        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .gt('message_count', 0)
            .order('updated_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Filter admin IPs if requested
        let filtered = sessions || [];
        if (excludeAdmin) {
            filtered = filtered.filter(s => !s.ip_address || !isAdminIP(s.ip_address));
        }

        // For each session, get last message preview
        const sessionsWithPreview = await Promise.all(
            filtered.map(async (session) => {
                const { data: lastMsg } = await supabase
                    .from('chat_messages')
                    .select('content, role')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                return {
                    ...session,
                    last_message: lastMsg?.content
                        ? (lastMsg.content.length > 80 ? lastMsg.content.slice(0, 80) + '…' : lastMsg.content)
                        : null,
                    last_message_role: lastMsg?.role || null,
                };
            })
        );

        return NextResponse.json({ sessions: sessionsWithPreview });
    } catch (error: unknown) {
        console.error('Error listing chat sessions:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
