import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ✅ Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    // ✅ Only accept POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    // ✅ Verify webhook signature (recommended)
    const signature = event.headers['x-dodo-signature'];
    if (process.env.DODO_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac('sha256', process.env.DODO_WEBHOOK_SECRET)
        .update(event.body)
        .digest('hex');

      if (expected !== signature) {
        console.warn('⚠️ Invalid Dodo signature');
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid signature' }),
        };
      }
    }

    const payload = JSON.parse(event.body || '{}');
    const data = payload.data || {};

    // ✅ Handle only successful payments
    if (payload.event !== 'payment.succeeded') {
      console.log(`ℹ️ Ignored event: ${payload.event}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Event ignored' }),
      };
    }

    const {
      email,
      metadata,
      amount_total,
      id: order_id,
      affiliate_id,
    } = data;

    if (!email || !metadata?.product_slug || !order_id) {
      console.error('❌ Missing fields:', data);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const product_slug = metadata.product_slug;
    const amount = (amount_total || 0) / 100;

    // ✅ Fetch product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .single();

    if (prodErr || !product) {
      console.error('❌ Product not found:', product_slug, prodErr);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Product not found' }),
      };
    }

    // ✅ Record purchase
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        product_id: product.id,
        amount,
        affiliate_id: affiliate_id || null,
        fulfilled: true,
      })
      .select()
      .single();

    if (purchaseErr) {
      console.error('❌ purchaseErr', purchaseErr);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to record purchase' }),
      };
    }

    // ✅ Generate secure token
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await supabase.from('download_tokens').insert({
      token,
      purchase_id: purchase.id,
      product_id: product.id,
      file_path: product.file_path,
      expires_at,
      used: false,
    });

    if (tokenErr) {
      console.error('❌ tokenErr', tokenErr);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to create token' }),
      };
    }

    console.log(`✅ Dodo purchase processed: ${order_id} | ${email}`);

    const thankYouUrl = `https://beparidig.netlify.app/thank-you?token=${token}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Purchase recorded successfully',
        redirect: thankYouUrl,
      }),
    };
  } catch (err) {
    console.error('❌ handler error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
