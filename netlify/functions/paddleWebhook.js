import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase using the Service Role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const body = JSON.parse(event.body);

    // Only handle completed transactions
    if (body.event_type !== "transaction.completed") {
      console.log("Ignoring event:", body.event_type);
      return { statusCode: 200, body: "Ignored non-completed event" };
    }

    const data = body.data;
    const purchaseId = data.id;
    const buyerEmail = data.customer?.email ?? null; // optional, not required

    // Create secure download token (valid 12 hours)
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h expiry

    // Insert token into Supabase
    const { error } = await supabase.from('download_tokens').insert({
      purchase_id: purchaseId,
      file_path: 'downloads/AI-Prompt.pdf',
      token,
      expires_at: expiresAt,
      used: false
    });

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { statusCode: 500, body: "DB insert failed" };
    }

    console.log(`✅ Token created for purchase ${purchaseId}: ${token}`);

    // Return token in response (thank-you page will fetch it)
    return {
      statusCode: 200,
      body: JSON.stringify({ token, expires_at: expiresAt })
    };

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { statusCode: 500, body: "Webhook processing error" };
  }
}
