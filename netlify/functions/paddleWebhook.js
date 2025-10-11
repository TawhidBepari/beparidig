import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Webhook } from '@paddle/paddle-node-sdk';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize Paddle Webhook verifier
const webhook = new Webhook(process.env.PADDLE_WEBHOOK_SECRET);

export async function handler(event) {
  try {
    // ✅ 1. Verify webhook signature
    const body = JSON.parse(event.body);
    const signature = body.p_signature;

    if (!signature) {
      console.error("❌ Missing Paddle signature");
      return { statusCode: 400, body: "Missing signature" };
    }

    let verifiedEvent;
    try {
      verifiedEvent = webhook.verify(event.body); // will throw if invalid
    } catch (verifyErr) {
      console.error("❌ Invalid Paddle webhook signature:", verifyErr.message);
      return { statusCode: 400, body: "Invalid signature" };
    }

    const data = verifiedEvent.data;

    // ✅ 2. Only handle completed transactions
    if (verifiedEvent.event_type !== "transaction.completed") {
      console.log("Ignoring event:", verifiedEvent.event_type);
      return { statusCode: 200, body: "Ignored non-completed event" };
    }

    const purchaseId = data.id;
    const buyerEmail = data.customer?.email ?? null;
    const paddleProductId = data.items?.[0]?.price?.product_id;

    if (!paddleProductId) {
      console.error("❌ Missing product ID in Paddle event");
      return { statusCode: 400, body: "Missing product ID" };
    }

    // ✅ 3. Look up product from Supabase
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, file_path')
      .eq('paddle_product_id', paddleProductId)
      .single();

    if (productError || !product) {
      console.error("❌ Unknown Paddle product:", paddleProductId);
      return { statusCode: 400, body: "Unknown product" };
    }

    // ✅ 4. Generate secure download token
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    // ✅ 5. Save to Supabase
    const { error: insertError } = await supabase.from('download_tokens').insert({
      purchase_id: purchaseId,
      product_id: product.id,
      file_path: product.file_path,
      token,
      expires_at: expiresAt,
      used: false,
      buyer_email: buyerEmail
    });

    if (insertError) {
      console.error("❌ Supabase insert error:", insertError);
      return { statusCode: 500, body: "DB insert failed" };
    }

    console.log(`✅ Token created for purchase ${purchaseId} (${product.name})`);

    // ✅ 6. Respond
    return {
      statusCode: 200,
      body: JSON.stringify({ token, expires_at: expiresAt })
    };

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { statusCode: 500, body: "Webhook processing error" };
  }
}
