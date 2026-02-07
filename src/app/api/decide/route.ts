
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
    // Simple A/B Logic: 50/50 split
    // In a real app, you'd hash the userID or sessionID to ensure consistency.

    const bucket = Math.random() < 0.5 ? 'control' : 'variant_b';

    return NextResponse.json({
        variant: bucket,
        shouldShowNewFeature: bucket === 'variant_b'
    }, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}

export async function OPTIONS() {
    return NextResponse.json({}, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}
