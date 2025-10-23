// netlify/functions/getTokenByTxn.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper: get ISO date +/- minutes
function isoMinutesOffset(dt, minutes) {
  return new Date(dt.getTime() + minutes * 60 * 1000).toISOString();
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    const params = event.queryStringParameters || {};
    // accept multiple query param names
    const txn =
      params.txn ||
      params.transaction_id ||
      params.transactionId ||
      params.purchase_id ||
      params.purchaseId ||
      params.transaction ||
      null;

    if (!txn) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Missing transaction ID' }),
      };
    }

    console.log('🔍 Looking up token for transaction:', txn);

    // 1) Direct lookup: download_tokens.purchase_id == txn
    const { data: direct, error: directErr } = await supabase
      .from('download_tokens')
      .select('token, file_path, expires_at, used, created_at, purchase_id, product_id')
      .eq('purchase_id', txn)
      .limit(1)
      .maybeSingle();

    if (directErr) {
      console.error('❌ Supabase direct select error:', directErr);
      return { statusCode: 500, body: JSON.stringify({ success: false, message: 'DB error' }) };
    }

    if (direct) {
      if (direct.used) {
        return { statusCode: 410, body: JSON.stringify({ success: false, message: 'Token already used' }) };
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          token: direct.token,
          file_path: direct.file_path,
          expires_at: direct.expires_at,
        }),
      };
    }

    // 2) If not found directly, try to map a payment_id -> purchase by looking up purchases table
    // (This handles the case Dodo redirects with pay_... but placeholder was created with cks_...)
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .select('id, product_id, created_at, provider_order_id')
      .eq('provider_order_id', txn)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (purchaseErr) {
      console.error('❌ Supabase purchase select error:', purchaseErr);
      return { statusCode: 500, body: JSON.stringify({ success: false, message: 'DB error' }) };
    }

    if (purchase) {
      // attempt to find a download_tokens row for same product around the purchase time
      // placeholder is created on checkout creation (earlier), so we search +/- 10 minutes
      const createdAt = new Date(purchase.created_at || new Date());
      const before = isoMinutesOffset(createdAt, -10);
      const after = isoMinutesOffset(createdAt, 10);

      const { data: candidate, error: candErr } = await supabase
        .from('download_tokens')
        .select('token, file_path, expires_at, used, created_at, purchase_id')
        .eq('product_id', purchase.product_id)
        .gte('created_at', before)
        .lte('created_at', after)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (candErr) {
        console.error('❌ Supabase candidate select error:', candErr);
        return { statusCode: 500, body: JSON.stringify({ success: false, message: 'DB error' }) };
      }

      if (candidate) {
        if (candidate.used) {
          return { statusCode: 410, body: JSON.stringify({ success: false, message: 'Token already used' }) };
        }
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            token: candidate.token,
            file_path: candidate.file_path,
            expires_at: candidate.expires_at,
            purchase_id: candidate.purchase_id,
          }),
        };
      }
    }

    // 3) Not found
    console.warn('⚠️ No matching download token yet for transaction:', txn);
    return {
      statusCode: 404,
      body: JSON.stringify({
        success: false,
        message: 'No download available yet. Please wait a few seconds and refresh this page.',
      }),
    };
  } catch (err) {
    console.error('❌ getTokenByTxn error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Server error while validating purchase.' }),
    };
  }
}
