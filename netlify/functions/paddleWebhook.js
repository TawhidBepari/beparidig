// netlify/functions/paddleWebhook.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Paddle } from '@paddle/paddle-node-sdk';

// Supabase (Service Role key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Paddle SDK
const paddle = new Paddle(process.env.PADDLE_API_KEY || '');

// Default file path (fallback to keep your current download working)
const DEFAULT_FILE_PATH = 'downloads/AI-Prompt.pdf';

// Helper to read signature header (case-insensitive)
function getPaddleSignatureHeader(headers) {
  if (!headers) return null;
  return (
    headers['paddle-signature'] ||
    headers['Paddle-Signature'] ||
    headers['PADDLE-SIGNATURE'] ||
    headers['paddle-signature'.toLowerCase()]
  );
}

export async function handler(event) {
  try {
    const rawBody = event.body;
    const signature = getPaddleSignatureHeader(event.headers);

    if (!signature) {
      console.error('❌ Missing Paddle signature header');
      return { statusCode: 400, body: 'Missing signature' };
    }

    const secretKey = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secretKey) {
      console.warn('⚠️ PADDLE_WEBHOOK_SECRET not set — signature verification may fail');
    }

    // Verify Paddle webhook
    let webhookEvent;
    try {
      webhookEvent = await paddle.webhooks.unmarshal(rawBody, secretKey, signature);
    } catch (verifyErr) {
      console.error('❌ Paddle signature verification failed:', verifyErr?.message || verifyErr);
      return { statusCode: 400, body: 'Invalid signature' };
    }

    // Only handle completed transactions
    if (webhookEvent.eventType !== 'transaction.completed') {
      console.log('Ignoring event type:', webhookEvent.eventType);
      return { statusCode: 200, body: 'Ignored non-completed event' };
    }

    const data = webhookEvent.data;
    const purchaseId = data.id;
    if (!purchaseId) {
      console.error('❌ No purchase id in webhook payload');
      return { statusCode: 400, body: 'Missing purchase id' };
    }

    // Try to get Paddle product ID from payload
    const paddlePriceId =
      data.items?.[0]?.price?.product_id ||
      data.product_id ||
      data.items?.[0]?.price?.id ||
      data.items?.[0]?.product_id ||
      null;

    let product = null;

    // 1️⃣ Match product by paddle_price_id
    if (paddlePriceId) {
      const { data: prodByPid, error: pidErr } = await supabase
        .from('products')
        .select('id, name, file_path')
        .eq('paddle_price_id', paddlePriceId)
        .maybeSingle();

      if (pidErr) console.error('Supabase product lookup (by paddle_price_id) error:', pidErr);
      else if (prodByPid) product = prodByPid;
    }

    // 2️⃣ Match by product name if needed
    if (!product) {
      const payloadName = data.product_name || data.items?.[0]?.name || data.product?.name || null;
      if (payloadName) {
        const { data: matches, error: nameErr } = await supabase
          .from('products')
          .select('id, name, file_path')
          .ilike('name', `%${payloadName}%`)
          .limit(1);

        if (nameErr) console.error('Supabase product lookup (by name) error:', nameErr);
        else if (matches && matches.length > 0) product = matches[0];
      }
    }

    // 3️⃣ Match by default file path
    if (!product) {
      const { data: prodByFile, error: fileErr } = await supabase
        .from('products')
        .select('id, name, file_path')
        .eq('file_path', DEFAULT_FILE_PATH)
        .maybeSingle();

      if (fileErr) console.error('Supabase product lookup (by file_path) error:', fileErr);
      else if (prodByFile) product = prodByFile;
    }

    const selectedFilePath = product?.file_path || DEFAULT_FILE_PATH;
    const selectedProductId = product?.id || null;

    // 4️⃣ Generate token + expiry
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    // 5️⃣ Insert token into Supabase
    const insertPayload = {
      purchase_id: purchaseId,
      file_path: selectedFilePath,
      token,
      expires_at: expiresAt,
      used: false,
      product_id: selectedProductId
    };

    const { error: insertError } = await supabase
      .from('download_tokens')
      .insert(insertPayload);

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError);
      return { statusCode: 500, body: 'DB insert failed' };
    }

    console.log(`✅ Token created for purchase ${purchaseId} (token=${token}) file=${selectedFilePath} product_id=${selectedProductId}`);

    // 6️⃣ Return same response your thank-you page expects
    return {
      statusCode: 200,
      body: JSON.stringify({ token, expires_at: expiresAt })
    };

  } catch (err) {
    console.error('❌ Webhook error:', err);
    return { statusCode: 500, body: 'Webhook processing error' };
  }
}
