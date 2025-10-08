import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function handler(event) {
  console.log("🔥 Paddle webhook triggered");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  console.log("🔑 Supabase key prefix:", SUPABASE_SERVICE_KEY?.slice(0, 6));
  console.log("🌍 Supabase URL:", SUPABASE_URL);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = JSON.parse(event.body);
    console.log("🧾 Event type:", body.event_type);

    if (body.event_type !== "transaction.completed") {
      return { statusCode: 200, body: "Ignored non-completed event" };
    }

    const data = body.data;
    const purchaseId = data.id;
    const buyerEmail = data.customer?.email || data.customer_email || null;
    
    console.log("💰 Purchase ID:", purchaseId);
    console.log("📧 Buyer Email:", buyerEmail);

    if (!buyerEmail) {
      console.error("❌ Missing buyer email in Paddle webhook");
      return { statusCode: 400, body: "Missing buyer email" };
    }

    // Create secure download token (valid for 12h)
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    console.log("🔐 Token generated:", token);

    // Attempt insert
    const { data: insertData, error } = await supabase.from('download_tokens').insert({
      purchase_id: purchaseId,
      file_path: 'downloads/AI-Prompt.pdf',
      token,
      expires_at: expiresAt,
      used: false
    }).select();

    console.log("📦 Insert result:", insertData);
    if (error) throw new Error("Supabase insert failed: " + JSON.stringify(error));

    console.log("✅ Token stored in Supabase");

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { statusCode: 500, body: "Webhook processing error" };
  }
}
