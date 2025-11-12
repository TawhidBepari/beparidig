// ✅ /netlify/functions/dodo-webhook.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Must be service key, not anon
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
    console.log('📩 Dodo webhook body:', JSON.stringify(body).slice(0, 2000));

    const eventType = body.type || body.eventType;
    const data = body.data || body.payload || {};

    // ✅ Only process successful payments
    if (
      !['payment.succeeded', 'checkout.completed'].includes(eventType) ||
      (data.status && data.status !== 'succeeded')
    ) {
      console.log(`ℹ️ Ignored event: ${eventType}`);
      return { statusCode: 200, body: 'Ignored non-success event' };
    }

    // ✅ Normalize fields
    const email = data.customer?.email;
    const order_id = data.payment_id || data.id;
    const checkout_id = data.checkout_session_id || data.session_id;
    const product_id =
      data.product_cart?.[0]?.product_id || data.product_id || null;

    // Convert cents to standard currency
    const amount =
      (data.settlement_amount ?? data.total_amount ?? 0) /
      (data.settlement_amount ? 1 : 100);
    const reportCurrency = data.settlement_currency || data.currency || 'USD';

    // Extract referral code from metadata
    const metadata = data.metadata || {};
    const referralCode =
      metadata?.referral_code ||
      metadata?.referral_id ||
      metadata?.ref ||
      metadata?.affiliate ||
      null;

    if (!email || !order_id || !product_id || !checkout_id) {
      console.error('❌ Missing required fields', {
        email,
        order_id,
        product_id,
        checkout_id
      });
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // ✅ Find product info
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, price, currency, file_path')
      .eq('dodo_product_id', product_id)
      .maybeSingle();

    if (prodErr || !product) {
      console.error('❌ Product not found:', product_id, prodErr);
      return { statusCode: 404, body: 'Product not found' };
    }

    // ✅ Create or update download token (fixed duplicate issue)
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Try update first
    const { data: tokenUpdate, error: tokenUpdateErr } = await supabase
      .from('download_tokens')
      .update({
        token,
        file_path: product.file_path,
        expires_at,
        used: false,
        product_id: product.id
      })
      .eq('purchase_id', checkout_id);

    if (tokenUpdateErr) {
      console.error('⚠️ download_tokens update error:', tokenUpdateErr);
    }

    // Insert safely if not updated
    if (!tokenUpdate || tokenUpdate.length === 0) {
      const { error: tokenInsertErr } = await supabase
        .from('download_tokens')
        .insert({
          token,
          purchase_id: checkout_id,
          product_id: product.id,
          file_path: product.file_path,
          expires_at,
          used: false
        })
        .onConflict('token') // ✅ prevents duplicate-key error on webhook retries
        .ignore();

      if (tokenInsertErr)
        console.error('⚠️ Failed to insert token:', tokenInsertErr);
      else console.log('✅ Token created for', checkout_id);
    } else {
      console.log('✅ Updated existing token for', checkout_id);
    }

    // ✅ Record purchase safely
    const { error: purchaseErr } = await supabase.from('purchases').insert({
      email,
      provider: 'dodo',
      provider_order_id: order_id,
      provider_checkout_id: checkout_id,
      product_id: product.id,
      amount,
      currency: reportCurrency || product.currency || 'USD',
      fulfilled: true
    });

    if (purchaseErr) {
      console.error('❌ purchase insert error', purchaseErr);
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    console.log(`✅ Purchase recorded: ${email} | ${amount} ${reportCurrency}`);

    // ✅ Affiliate commission
    if (referralCode) {
      console.log('🔎 Referral detected:', referralCode);

      const { data: affiliate, error: affErr } = await supabase
        .from('affiliates')
        .select('id')
        .eq('code', referralCode)
        .maybeSingle();

      if (affErr || !affiliate) {
        console.warn('⚠️ Affiliate not found for referral code:', referralCode);
      } else {
        const commissionRate = 0.5;
        const commissionAmount = parseFloat(
          (amount * commissionRate).toFixed(2)
        );

        const { error: affInsertErr } = await supabase
          .from('affiliate_commissions')
          .insert({
            affiliate_id: affiliate.id,
            purchase_id: checkout_id,
            product_id: product.id,
            amount: commissionAmount,
            currency: reportCurrency || 'USD',
            status: 'pending',
            created_at: new Date().toISOString()
          });

        if (affInsertErr)
          console.error(
            '⚠️ Failed to insert affiliate commission:',
            affInsertErr
          );
        else
          console.log(
            `💸 Recorded 50% commission = ${commissionAmount} ${reportCurrency}`
          );
      }
    } else {
      console.log('ℹ️ No referral code — skipping affiliate commission');
    }

    // ✅ Redirect after purchase
    const thankYouUrl = `https://beparidig.netlify.app/thank-you?purchase_id=${checkout_id}`;
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'OK', redirect: thankYouUrl })
    };
  } catch (err) {
    console.error('🔥 Fatal error in dodo-webhook:', err);
    return { statusCode: 500, body: 'Webhook processing failed' };
  }
}
