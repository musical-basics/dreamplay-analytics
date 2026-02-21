import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — return all manual IP→email mappings as { [ip]: email }
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('ip_email_map')
            .select('ip_address, email');

        if (error) throw error;

        const map: Record<string, string> = {};
        (data || []).forEach((row: { ip_address: string; email: string }) => {
            map[row.ip_address] = row.email;
        });

        return NextResponse.json(map);
    } catch (error) {
        console.error('[IP-Email API] GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
    }
}

// POST — upsert a manual IP→email mapping
export async function POST(request: Request) {
    try {
        const { ip, email } = await request.json();

        if (!ip || !email) {
            return NextResponse.json({ error: 'Missing ip or email' }, { status: 400 });
        }

        const { error } = await supabase
            .from('ip_email_map')
            .upsert(
                { ip_address: ip, email },
                { onConflict: 'ip_address' }
            );

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[IP-Email API] POST error:', error);
        return NextResponse.json({ error: 'Failed to save mapping' }, { status: 500 });
    }
}
