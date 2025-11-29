// /netlify/functions/dodo-webhook.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// convert Dodo amounts (minor units) to major units safely
function toMajorAmount(raw) {
  if (raw === null || raw === undefined) return 0;
  // if integer -> treat as minor units (e.g., 1199 -> 11.99)
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw / 100;
  // if it's string like "1199" -> parse and treat as minor units if integer
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (Number.isInteger(n)) return n / 100;
  // else assume it's already major (11.99)
  return n;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // optional signature verification
    try {
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
    } catch (sigErr) {
      console.warn('Signature check error (continuing if not configured):', sigErr);
    }

    const body = JSON.parse(event.body || '{}');
    console.log('📩 Received Dodo webhook:', JSON.stringify(body).slice(0, 2000));

    const eventType = body.type || body.eventType;
    const data = body.data || body.payload || {};

    if (
      !['payment.succeeded', 'checkout.completed'].includes(eventType) ||
      (data.status && data.status !== 'succeeded')
    ) {
      console.log(`ℹ️ Ignored event: ${eventType}`);
      return { statusCode: 200, body: 'Ignored non-success event' };
    }

    // normalize fields
    const email = data.customer?.email || null;
    const order_id = data.payment_id || data.id || null;
    const checkout_id = data.checkout_session_id || data.session_id || null;
    const dodo_product_id = data.product_cart?.[0]?.product_id || data.product_id || null;

    // Convert settlement_amount minor->major (e.g., 1199 -> 11.99)
    const settlementRaw = data.settlement_amount ?? null;
    const settlementCurrency = data.settlement_currency ?? 'USD';
    const amountMajor = Number(toMajorAmount(settlementRaw).toFixed(2)); // e.g., 11.99

    // referral code
    const metadata = data.metadata || {};
    const rawReferral =
      metadata?.referral_code ?? metadata?.referral_id ?? metadata?.ref ?? metadata?.affiliate ?? null;
    const referralCode =
      rawReferral && typeof rawReferral === 'string' && rawReferral.trim() !== '' ? rawReferral.trim() : null;

    if (!email || !order_id || !checkout_id || !dodo_product_id) {
      console.error('❌ Missing required fields', { email, order_id, checkout_id, dodo_product_id });
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // product lookup
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, price, currency, file_path, affiliate_rate')
      .eq('dodo_product_id', dodo_product_id)
      .maybeSingle();

    if (prodErr || !product) {
      console.error('❌ Product not found for dodo id:', dodo_product_id, prodErr);
      return { statusCode: 404, body: 'Product not found' };
    }

    // -------------------------
    // idempotent purchase insert
    // -------------------------
    const { count: existingPurchases } = await supabase
      .from('purchases')
      .select('id', { head: true, count: 'exact' })
      .eq('provider_checkout_id', checkout_id);

    if (existingPurchases === 0) {
      const { error: purchaseErr } = await supabase.from('purchases').insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        provider_checkout_id: checkout_id,
        product_id: product.id,
        amount: amountMajor,
        currency: 'USD',
        fulfilled: true
      });

      if (purchaseErr) {
        console.error('❌ purchase insert error', purchaseErr);
        return { statusCode: 500, body: 'Failed to record purchase' };
      }
      console.log(`✅ Purchase recorded: ${email} | ${amountMajor} USD`);
    } else {
      console.log('ℹ️ Purchase already recorded (idempotent):', checkout_id);
    }

    // -------------------------
    // download token upsert
    // -------------------------
    const newToken = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { count: existingTokenCount } = await supabase
      .from('download_tokens')
      .select('id', { head: true, count: 'exact' })
      .eq('purchase_id', checkout_id);

    if (existingTokenCount > 0) {
      const { error: tokenUpdateErr } = await supabase
        .from('download_tokens')
        .update({
          token: newToken,
          file_path: product.file_path,
          expires_at,
          used: false,
          product_id: product.id
        })
        .eq('purchase_id', checkout_id);

      if (tokenUpdateErr) console.error('⚠️ Token update failed:', tokenUpdateErr);
      else console.log('🔄 Updated existing download token for', checkout_id);
    } else {
      const { error: tokenInsertErr } = await supabase
        .from('download_tokens')
        .insert({
          token: newToken,
          purchase_id: checkout_id,
          product_id: product.id,
          file_path: product.file_path,
          expires_at,
          used: false
        });

      if (tokenInsertErr) console.error('⚠️ Token insert failed:', tokenInsertErr);
      else console.log('✅ Created download token for', checkout_id);
    }

    // -------------------------
    // affiliate commission (only if referralCode exists)
    // -------------------------
    if (referralCode) {
      console.log('🔎 Referral detected:', referralCode);

      const { data: affiliate, error: affErr } = await supabase
        .from('affiliates')
        .select('id, name')
        .eq('code', referralCode)
        .maybeSingle();

      if (affErr || !affiliate) {
        console.warn('⚠️ Affiliate not found for code:', referralCode);
      } else {
        // commission using stored USD major amount; prefer product.affiliate_rate when present
        const rate = product.affiliate_rate && Number(product.affiliate_rate) > 0 ? Number(product.affiliate_rate) : 0.5;
        const commissionAmount = Number((amountMajor * rate).toFixed(2));

        // prevent duplicate commission for same affiliate+purchase
        const { count: existingComm } = await supabase
          .from('affiliate_commissions')
          .select('id', { head: true, count: 'exact' })
          .eq('affiliate_id', affiliate.id)
          .eq('purchase_id', checkout_id);

        if (existingComm && existingComm > 0) {
          console.log('⏭️ Commission already exists for affiliate+purchase — skipping');
        } else {
          const { error: affInsertErr } = await supabase
            .from('affiliate_commissions')
            .insert({
              affiliate_id: affiliate.id,
              affiliate_name: affiliate.name,
              purchase_id: checkout_id,
              product_id: product.id,
              amount: commissionAmount,
              currency: 'USD',
              status: 'pending',
              referral_id: referralCode,
              source: 'dodo-webhook',
              created_at: new Date().toISOString()
            });

          if (affInsertErr) console.error('⚠️ Failed to insert affiliate commission:', affInsertErr);
          else console.log(`💸 Recorded commission ${commissionAmount} USD for affiliate ${affiliate.name}`);
        }
      }
    } else {
      console.log('ℹ️ No referral — skipping affiliate commission');
    }

    // redirect or respond
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
