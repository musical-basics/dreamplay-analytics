import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0',
};

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

        return NextResponse.json(map, { headers: noCacheHeaders });
    } catch (error) {
        console.error('[IP-Email API] GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500, headers: noCacheHeaders });
    }
}

// POST — upsert a manual IP→email mapping
export async function POST(request: Request) {
    try {
        const { ip, email } = await request.json();

        if (!ip || !email) {
            return NextResponse.json({ error: 'Missing ip or email' }, { status: 400, headers: noCacheHeaders });
        }

        const { error } = await supabase
            .from('ip_email_map')
            .upsert(
                { ip_address: ip, email },
                { onConflict: 'ip_address' }
            );

        if (error) throw error;

        return NextResponse.json({ success: true }, { headers: noCacheHeaders });
    } catch (error) {
        console.error('[IP-Email API] POST error:', error);
        return NextResponse.json({ error: 'Failed to save mapping' }, { status: 500, headers: noCacheHeaders });
    }
}
