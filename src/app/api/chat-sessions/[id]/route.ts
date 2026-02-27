import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Get full session with all messages
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const [sessionRes, messagesRes] = await Promise.all([
            supabase
                .from('chat_sessions')
                .select('*')
                .eq('id', id)
                .single(),
            supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', id)
                .order('created_at', { ascending: true }),
        ]);

        if (sessionRes.error) throw sessionRes.error;

        return NextResponse.json({
            session: sessionRes.data,
            messages: messagesRes.data || [],
        });
    } catch (error: unknown) {
        console.error('Error fetching chat session:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// POST: Admin sends a reply
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { content } = await req.json();

        if (!content?.trim()) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // Insert admin message
        const { error: msgError } = await supabase
            .from('chat_messages')
            .insert({
                session_id: id,
                role: 'admin',
                content: content.trim(),
            });

        if (msgError) throw msgError;

        // Update session: mark admin takeover + increment count
        const { data: session } = await supabase
            .from('chat_sessions')
            .select('message_count')
            .eq('id', id)
            .single();

        await supabase
            .from('chat_sessions')
            .update({
                status: 'admin_takeover',
                admin_takeover_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                message_count: (session?.message_count || 0) + 1,
            })
            .eq('id', id);

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error posting admin reply:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
