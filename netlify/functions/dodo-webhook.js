// ✅ /netlify/functions/dodo-webhook.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
    console.log('📩 Raw Dodo webhook body:', body);

    const eventType = body.type || body.eventType;
    const data = body.data || body.payload || {};

    if (
      !['payment.succeeded', 'checkout.completed'].includes(eventType) ||
      (data.status && data.status !== 'succeeded')
    ) {
      console.log(`ℹ️ Ignored event: ${eventType}`);
      return { statusCode: 200, body: 'Ignored non-success event' };
    }

    const email = data.customer?.email;
    const order_id = data.payment_id || data.id;
    const checkout_id = data.checkout_session_id || data.session_id;
    const product_id =
      data.product_cart?.[0]?.product_id || data.product_id || null;
    const amount = (data.total_amount || 0) / 100;
    const metadata = data.metadata || {};

    if (!email || !order_id || !product_id || !checkout_id) {
      console.error('❌ Missing required fields:', {
        email,
        order_id,
        product_id,
        checkout_id,
      });
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

    // ✅ Generate new token & expiry
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ✅ Update placeholder record
    const { error: updateErr, count } = await supabase
      .from('download_tokens')
      .update({
        token,
        file_path: product.file_path,
        expires_at,
        used: false,
      })
      .eq('purchase_id', checkout_id)
      .select('*', { count: 'exact' });

    if (updateErr) {
      console.error('❌ updateErr', updateErr);
      return { statusCode: 500, body: 'Failed to update existing token' };
    }

    if (count === 0) {
      console.warn('⚠️ No placeholder found, creating fresh token');
      const { error: tokenErr } = await supabase.from('download_tokens').insert({
        token,
        purchase_id: checkout_id,
        product_id: product.id,
        file_path: product.file_path,
        expires_at,
        used: false,
      });
      if (tokenErr) {
        console.error('❌ tokenErr', tokenErr);
        return { statusCode: 500, body: 'Failed to create token' };
      }
    }

    // ✅ Record purchase
    const { error: purchaseErr } = await supabase.from('purchases').insert({
      email,
      provider: 'dodo',
      provider_order_id: order_id,
      product_id: product.id,
      amount,
      fulfilled: true,
    });

    if (purchaseErr) {
      console.error('❌ purchaseErr', purchaseErr);
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    console.log(`✅ Dodo purchase processed: ${order_id} | ${email}`);

    // ----------------------------------------------------------------------
    // 🧩 NEW: Update affiliate_commissions if referral exists
    // ----------------------------------------------------------------------
    if (metadata?.referral_id) {
      try {
        const commissionRate = 0.2; // 20% commission
        const commissionAmount = parseFloat((amount * commissionRate).toFixed(2));

        const { error: affErr } = await supabase
          .from('affiliate_commissions')
          .update({
            amount: commissionAmount,
            currency: 'USD',
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('purchase_id', checkout_id);

        if (affErr) {
          console.warn('⚠️ Failed to update affiliate commission:', affErr);
        } else {
          console.log(`💸 Affiliate commission paid: $${commissionAmount}`);
        }
      } catch (affCatch) {
        console.error('❌ Affiliate update exception:', affCatch);
      }
    }

    // ✅ Redirect URL
    const thankYouUrl = `https://beparidig.netlify.app/thank-you?purchase_id=${checkout_id}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Purchase recorded successfully',
        redirect: thankYouUrl,
      }),
    };
  } catch (err) {
    console.error('❌ handler error', err);
    return { statusCode: 500, body: 'Error processing webhook' };
  }
}
