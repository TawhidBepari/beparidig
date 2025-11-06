// /netlify/functions/dodo-webhook.js
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

    // Verify signature if present
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
    console.log('📩 Raw webhook body:', JSON.stringify(body).slice(0, 2000)); // log trimmed

    const eventType = body.type || body.eventType;
    const data = body.data || body.payload || {};

    // Only process succeeded payments / completed checkouts
    if (
      !['payment.succeeded', 'checkout.completed'].includes(eventType) ||
      (data.status && data.status !== 'succeeded')
    ) {
      console.log(`ℹ️ Ignored event: ${eventType}`);
      return { statusCode: 200, body: 'Ignored non-success event' };
    }

    // normalize fields
    const email = data.customer?.email;
    const order_id = data.payment_id || data.id;
    const checkout_id = data.checkout_session_id || data.session_id;
    const product_id =
      data.product_cart?.[0]?.product_id || data.product_id || null;

    // Dodo amounts are often in cents; use settlement_amount when present
    const amount = (data.settlement_amount ?? data.total_amount ?? 0) / (data.settlement_amount ? 1 : 100);
    // currency fallback: settlement_currency -> product currency -> USD
    const reportCurrency = data.settlement_currency || null;

    // normalize metadata referral possible keys
    const metadata = data.metadata || {};
    const referralCode =
      metadata?.referral_id ||
      metadata?.ref ||
      metadata?.affiliate ||
      metadata?.affonso_referral ||
      null;

    if (!email || !order_id || !product_id || !checkout_id) {
      console.error('❌ Missing required fields', { email, order_id, product_id, checkout_id });
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // find product row
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, price, currency, file_path')
      .eq('dodo_product_id', product_id)
      .limit(1)
      .maybeSingle();

    if (prodErr) {
      console.error('❌ product lookup error', prodErr);
      return { statusCode: 500, body: 'Product lookup error' };
    }
    if (!product) {
      console.error('❌ product not found in DB for', product_id);
      return { statusCode: 404, body: 'Product not found' };
    }

    // create token & expiry
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // update placeholder in download_tokens if exists
    const { data: updateData, error: updateErr } = await supabase
      .from('download_tokens')
      .update({
        token,
        file_path: product.file_path,
        expires_at,
        used: false,
        product_id: product.id
      })
      .eq('purchase_id', checkout_id)
      .select('id');

    if (updateErr) {
      console.error('❌ download_tokens update error', updateErr);
      // keep going — we'll try to create the token below if none updated
    }

    // if no existing placeholder (updateData is empty) then insert a token row
    const updatedRows = Array.isArray(updateData) ? updateData.length : (updateData ? 1 : 0);
    if (updatedRows === 0) {
      const { error: insertTokenErr } = await supabase
        .from('download_tokens')
        .insert({
          token,
          purchase_id: checkout_id,
          product_id: product.id,
          file_path: product.file_path,
          expires_at,
          used: false
        });

      if (insertTokenErr) {
        console.error('❌ failed to insert download_tokens placeholder', insertTokenErr);
        // not fatal: continue to record purchase
      } else {
        console.log('✅ inserted download_tokens placeholder for', checkout_id);
      }
    } else {
      console.log('✅ updated existing download_tokens placeholder for', checkout_id);
    }

    // record purchase in purchases table
    const { data: purchaseData, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        provider_checkout_id: checkout_id,
        product_id: product.id,
        amount,
        currency: reportCurrency || product.currency || 'USD',
        fulfilled: true
      })
      .select('id')
      .limit(1)
      .maybeSingle();

    if (purchaseErr) {
      console.error('❌ purchase insert error', purchaseErr);
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    console.log('✅ purchase recorded', { order_id, checkout_id, product_id, amount });

    // ------------------- Affiliate logic -------------------
    try {
      if (referralCode) {
        console.log('🔎 referral detected in metadata:', referralCode);

        // resolve affiliate.id by code in affiliates table
        const { data: affRow, error: affLookupErr } = await supabase
          .from('affiliates')
          .select('id')
          .eq('code', referralCode)
          .limit(1)
          .maybeSingle();

        if (affLookupErr) {
          console.warn('⚠️ affiliate lookup error', affLookupErr);
        }

        if (!affRow || !affRow.id) {
          console.warn('⚠️ No affiliate matched code:', referralCode);
          // optionally: insert commission row with affiliate_id NULL and store referral_code someplace
        } else {
          const affiliate_id = affRow.id;
          // compute commission: 50%
          const commissionRate = 0.5;
          const commissionAmount = parseFloat((amount * commissionRate).toFixed(2));
          const currency = reportCurrency || product.currency || 'USD';

          // First try update existing affiliate_commissions by purchase_id
          const { data: updatedAffRows, error: affUpdateErr } = await supabase
            .from('affiliate_commissions')
            .update({
              affiliate_id,
              product_id: product.id,
              amount: commissionAmount,
              currency,
              status: 'pending',
              updated_at: new Date().toISOString()
            })
            .eq('purchase_id', checkout_id)
            .select('id');

          if (affUpdateErr) {
            console.error('❌ affiliate_commissions update error', affUpdateErr);
          }

          const updatedCount = Array.isArray(updatedAffRows) ? updatedAffRows.length : (updatedAffRows ? 1 : 0);

          if (updatedCount === 0) {
            // no existing commission placeholder — insert a fresh commission row
            const { error: affInsertErr, data: affInsertData } = await supabase
              .from('affiliate_commissions')
              .insert({
                affiliate_id,
                purchase_id: checkout_id,
                product_id: product.id,
                amount: commissionAmount,
                currency,
                status: 'pending',
                created_at: new Date().toISOString()
              })
              .select('id')
              .limit(1)
              .maybeSingle();

            if (affInsertErr) {
              console.error('❌ failed to insert affiliate_commissions', affInsertErr);
            } else {
              console.log('✅ affiliate_commission inserted', affInsertData?.id || 'id-not-returned');
            }
          } else {
            console.log('✅ affiliate_commission updated for purchase', checkout_id);
          }
        }
      } else {
        console.log('ℹ️ no referral metadata present; skipping affiliate steps');
      }
    } catch (affCatch) {
      console.error('❌ exception in affiliate logic', affCatch);
    }

    // final success
    const thankYouUrl = `https://beparidig.netlify.app/thank-you?purchase_id=${checkout_id}`;
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'OK', redirect: thankYouUrl })
    };
  } catch (err) {
    console.error('🔥 dodo-webhook fatal error', err);
    return { statusCode: 500, body: 'Error processing webhook' };
  }
}
