
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

function verifyShopifyHmac(body: string, hmacHeader: string): boolean {
    if (!SHOPIFY_WEBHOOK_SECRET) {
        console.warn('[Shopify Webhook] No SHOPIFY_WEBHOOK_SECRET set — skipping HMAC verification');
        return true; // Allow in dev, but log warning
    }
    const digest = crypto
        .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
        .update(body, 'utf8')
        .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

export async function POST(request: Request) {
    console.log('[Shopify Webhook] Received order webhook');

    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256') || '';

    // Verify HMAC signature
    if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyHmac(rawBody, hmacHeader)) {
        console.error('[Shopify Webhook] Invalid HMAC signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    try {
        const order = JSON.parse(rawBody);

        const orderId = order.id || order.order_number;
        const totalPrice = order.total_price;
        const customerEmail = order.email || order.customer?.email || null;
        const note = order.note || '';

        // Parse checkout_source from note field
        // Format: "checkout_source:pdp" or "checkout_source:customize"
        let checkoutSource = 'unknown';
        const sourceMatch = note.match(/checkout_source:(\w+)/);
        if (sourceMatch) {
            checkoutSource = sourceMatch[1]; // "pdp" or "customize"
        }

        console.log(`[Shopify Webhook] Order #${orderId} | Total: $${totalPrice} | Source: ${checkoutSource} | Email: ${customerEmail}`);

        // Insert purchase event into analytics_logs
        const { error } = await supabase
            .from('analytics_logs')
            .insert({
                event_name: 'purchase',
                path: '/shopify-order',
                ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'shopify-webhook',
                user_agent: 'Shopify-Webhook',
                metadata: {
                    checkout_source: checkoutSource,
                    order_id: orderId,
                    total_price: totalPrice,
                    customer_email: customerEmail,
                    order_number: order.order_number,
                    note: note,
                },
            });

        if (error) {
            console.error('[Shopify Webhook] Supabase insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log('[Shopify Webhook] Purchase event logged successfully');
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('[Shopify Webhook] Error processing webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
