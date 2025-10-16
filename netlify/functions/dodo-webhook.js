import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ✅ Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // ✅ Verify webhook signature (optional, if Dodo supports it)
    const signature = event.headers['x-dodo-signature'];
    if (process.env.DODO_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac('sha256', process.env.DODO_WEBHOOK_SECRET)
        .update(event.body)
        .digest('hex');

      if (expected !== signature) {
        console.warn('⚠️ Invalid Dodo signature');
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const body = JSON.parse(event.body || '{}');
    const { email, product_slug, order_id, amount, affiliate_id } = body;

    if (!email || !product_slug || !order_id) {
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // ✅ Find product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .single();

    if (prodErr || !product) {
      console.error('❌ Product not found', prodErr);
      return { statusCode: 404, body: 'Product not found' };
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
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    // ✅ Create download token
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await supabase.from('download_tokens').insert({
      token,
      purchase_id: purchase.id,
      file_path: product.file_path,
      expires_at,
      used: false,
    });

    if (tokenErr) {
      console.error('❌ tokenErr', tokenErr);
      return { statusCode: 500, body: 'Failed to create token' };
    }

    console.log(`✅ Dodo purchase processed: ${order_id}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Purchase recorded', token }),
    };
  } catch (err) {
    console.error('❌ handler error', err);
    return { statusCode: 500, body: 'Error processing webhook' };
  }
}
