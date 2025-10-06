// netlify/functions/paddleWebhook.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const isSandbox = process.env.NODE_ENV !== "production";
    if (isSandbox) console.log("⚠️ Sandbox mode — skipping signature verification");

    const body = JSON.parse(event.body);
    console.log("Webhook payload:", body);

    const eventType = body.event_type || body.eventType;
    if (eventType !== "transaction.completed" && eventType !== "transaction.paid") {
      return { statusCode: 200, body: "Ignored non-transaction event" };
    }

    const txnId = body.data?.id || body.data?.checkout?.id;
    const buyerEmail = body.data?.customer?.email || null;

    // generate unique token
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h expiry

    // store token in Supabase
    const { error } = await supabase.from("download_tokens").insert([
      { token, txn_id: txnId, email: buyerEmail, expires_at: expiresAt },
    ]);

    if (error) {
      console.error("Supabase insert error:", error);
      return { statusCode: 500, body: "Supabase insert failed" };
    }

    console.log(`✅ Token stored in Supabase for txn ${txnId}: ${token}`);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: "Internal server error" };
  }
}
