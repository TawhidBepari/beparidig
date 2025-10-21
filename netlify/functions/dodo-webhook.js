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

    // ✅ Verify Dodo webhook signature
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

    // ✅ Only handle successful payment events
    if (body.type !== 'payment.succeeded') {
      console.log(`ℹ️ Ignored event: ${body.type}`);
      return { statusCode: 200, body: 'Ignored non-payment event' };
    }

    const data = body.data || {};
    const email = data.customer?.email;
    const order_id = data.payment_id; // pay_...
    const checkout_id = data.checkout_session_id; // cks_...
    const product_id = data.product_cart?.[0]?.product_id;
    const amount = data.total_amount / 100; // Dodo sends cents
    const metadata = data.metadata || {};

    if (!email || !order_id || !product_id || !checkout_id) {
      console.error('❌ Missing required fields:', { email, order_id, product_id, checkout_id });
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // ✅ Find product in Supabase
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('dodo_product_id', product_id)
      .single();

    if (prodErr || !product) {
      console.error('❌ Product not found:', product_id, prodErr);
      return { statusCode: 404, body: 'Product not found' };
    }

    // ✅ Try to update existing placeholder record first (created in createCheckout)
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: updateErr, count } = await supabase
      .from('download_tokens')
      .update({
        token,
        file_path: product.file_path,
        expires_at,
        used: false
      })
      .eq('purchase_id', checkout_id)
      .select('*', { count: 'exact' });

    if (updateErr) {
      console.error('❌ updateErr', updateErr);
      return { statusCode: 500, body: 'Failed to update existing token' };
    }

    if (count === 0) {
      console.warn('⚠️ No placeholder found for checkout_id, creating fresh token record');
      const { error: tokenErr } = await supabase
        .from('download_tokens')
        .insert({
          token,
          purchase_id: checkout_id,
          product_id: product.id,
          file_path: product.file_path,
          expires_at,
          used: false
        });
      if (tokenErr) {
        console.error('❌ tokenErr', tokenErr);
        return { statusCode: 500, body: 'Failed to create token' };
      }
    }

    // ✅ Record purchase in purchases table
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        product_id: product.id,
        amount,
        fulfilled: true
      })
      .select()
      .single();

    if (purchaseErr) {
      console.error('❌ purchaseErr', purchaseErr);
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    console.log(`✅ Dodo purchase processed: ${order_id} | ${email}`);

    // ✅ Redirect URL for your frontend
    const thankYouUrl = `https://beparidig.netlify.app/thank-you?purchase_id=${checkout_id}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Purchase recorded successfully',
        redirect: thankYouUrl
      })
    };
  } catch (err) {
    console.error('❌ handler error', err);
    return { statusCode: 500, body: 'Error processing webhook' };
  }
}
