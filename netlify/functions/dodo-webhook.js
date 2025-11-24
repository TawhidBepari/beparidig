// =============================
//  /netlify/functions/dodo-webhook.js
// =============================
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

    // ======================================
    //  VERIFY DODO SIGNATURE
    // ======================================
    const signature = event.headers['x-dodo-signature'];
    if (process.env.DODO_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac('sha256', process.env.DODO_WEBHOOK_SECRET)
        .update(event.body)
        .digest('hex');

      if (expected !== signature) {
        console.warn('⚠️ Invalid Dodo webhook signature');
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const body = JSON.parse(event.body || '{}');
    console.log('📩 Received Dodo webhook:', JSON.stringify(body).slice(0, 2000));

    const eventType = body.type || body.eventType;
    const data = body.data || body.payload || {};

    // Only process successful payments
    if (
      !['payment.succeeded', 'checkout.completed'].includes(eventType) ||
      (data.status && data.status !== 'succeeded')
    ) {
      console.log(`ℹ️ Ignored event: ${eventType}`);
      return { statusCode: 200, body: 'Ignored non-success event' };
    }

    // ======================================
    //  NORMALIZE FIELDS
    // ======================================
    const email = data.customer?.email;
    const order_id = data.payment_id || data.id;
    const checkout_id = data.checkout_session_id || data.session_id;
    const product_id =
      data.product_cart?.[0]?.product_id || data.product_id || null;

    // Dodo sends real USD amounts as integers (not cents)
    const amount = data.settlement_amount;
    const reportCurrency = data.settlement_currency || 'USD';

    // STRICT affiliate code parsing
    const metadata = data.metadata || {};
    const rawReferral =
      metadata?.referral_code ??
      metadata?.referral_id ??
      metadata?.ref ??
      metadata?.affiliate ??
      null;

    const referralCode =
      rawReferral && typeof rawReferral === 'string' && rawReferral.trim() !== ''
        ? rawReferral.trim()
        : null;

    if (!email || !order_id || !product_id || !checkout_id) {
      console.error('❌ Missing required fields', {
        email,
        order_id,
        product_id,
        checkout_id
      });
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // ======================================
    //  PRODUCT LOOKUP
    // ======================================
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, price, currency, file_path')
      .eq('dodo_product_id', product_id)
      .maybeSingle();

    if (prodErr || !product) {
      console.error('❌ Product not found:', product_id, prodErr);
      return { statusCode: 404, body: 'Product not found' };
    }

    // ======================================
    //  PREVENT DUPLICATE PURCHASES
    // ======================================
    const { count: existingPurchases } = await supabase
      .from('purchases')
      .select('*', { head: true, count: 'exact' })
      .eq('provider_checkout_id', checkout_id);

    if (existingPurchases > 0) {
      console.log('ℹ️ Duplicate webhook – purchase already exists, skipping');
    } else {
      // Insert new purchase
      const { error: purchaseErr } = await supabase.from('purchases').insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        provider_checkout_id: checkout_id,
        product_id: product.id,
        amount,
        currency: reportCurrency,
        fulfilled: true
      });

      if (purchaseErr) {
        console.error('❌ purchase insert error', purchaseErr);
        return { statusCode: 500, body: 'Failed to record purchase' };
      }

      console.log(`✅ Purchase recorded: ${email} | ${amount} ${reportCurrency}`);
    }

    // ======================================
    //  DOWNLOAD TOKEN (safe upsert)
    // ======================================
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Check if token entry already exists
    const { count: existingTokenCount } = await supabase
      .from('download_tokens')
      .select('*', { head: true, count: 'exact' })
      .eq('purchase_id', checkout_id);

    if (existingTokenCount > 0) {
      // Update token
      const { error: tokenUpdateErr } = await supabase
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
        console.error('⚠️ Token update failed:', tokenUpdateErr);
      } else {
        console.log('🔄 Updated existing download token');
      }
    } else {
      // Insert token
      const { error: tokenInsertErr } = await supabase
        .from('download_tokens')
        .insert({
          token,
          purchase_id: checkout_id,
          product_id: product.id,
          file_path: product.file_path,
          expires_at,
          used: false
        });

      if (tokenInsertErr) {
        console.error('⚠️ Token insert failed:', tokenInsertErr);
      } else {
        console.log('✅ Created new download token');
      }
    }

    // ======================================
    //  AFFILIATE COMMISSION
    // ======================================
    if (referralCode) {
      console.log('🔎 Referral detected:', referralCode);

      const { data: affiliate, error: affErr } = await supabase
        .from('affiliates')
        .select('id')
        .eq('code', referralCode)
        .maybeSingle();

      if (affErr || !affiliate) {
        console.warn('⚠️ Affiliate not found:', referralCode);
      } else {
        const commissionRate = 0.5;
        const commissionAmount = Number((amount * commissionRate).toFixed(2));

        const { error: affInsertErr } = await supabase
          .from('affiliate_commissions')
          .insert({
            affiliate_id: affiliate.id,
            purchase_id: checkout_id,
            product_id: product.id,
            amount: commissionAmount,
            currency: reportCurrency,
            status: 'pending',
            created_at: new Date().toISOString()
          });

        if (affInsertErr) {
          console.error('⚠️ Failed to insert affiliate commission:', affInsertErr);
        } else {
          console.log(`💸 50% commission = ${commissionAmount} ${reportCurrency}`);
        }
      }
    } else {
      console.log('ℹ️ No referral – skipping commission');
    }

    // ======================================
    //  REDIRECT USER TO THANK YOU PAGE
    // ======================================
    const thankYouUrl = `https://beparidig.netlify.app/thank-you?purchase_id=${checkout_id}`;
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'OK', redirect: thankYouUrl })
    };
  } catch (err) {
    console.error('🔥 Fatal error in webhook:', err);
    return { statusCode: 500, body: 'Webhook processing failed' };
  }
}
