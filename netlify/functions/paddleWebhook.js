import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Debug: log environment variable status (safe)
  console.log("Environment check —");
  console.log("SUPABASE_URL:", SUPABASE_URL);
  console.log("SUPABASE_KEY (first 10 chars):", SUPABASE_KEY?.substring(0, 10));

  try {
    // Paddle webhook signature check (skipped in sandbox)
    const isSandbox = process.env.NODE_ENV !== "production";
    if (isSandbox) console.log("⚠️ Sandbox mode — skipping signature verification");

    const body = JSON.parse(event.body);
    console.log("📦 Webhook payload:", body);

    const eventType = body.event_type || body.eventType;
    if (eventType !== "transaction.completed" && eventType !== "transaction.paid") {
      console.log("ℹ️ Ignored non-transaction event:", eventType);
      return { statusCode: 200, body: "Ignored non-transaction event" };
    }

    // Get purchase ID and email (if available)
    const purchaseId = body.data?.id || body.data?.checkout?.id || "unknown";
    const buyerEmail = body.data?.customer?.email || "unknown";

    // Generate unique token
    const token = crypto.randomBytes(16).toString("hex");

    // Store the relative path to your eBook file
    const filePath = "downloads/AI-Prompt.pdf"; // Adjust if renamed or moved

    // Token expires after 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Insert record into Supabase
    const { error } = await supabase.from("download_tokens").insert([
      {
        token,
        purchase_id: purchaseId,
        file_path: filePath,
        expires_at: expiresAt,
        used: false,
      },
    ]);

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { statusCode: 500, body: "Supabase insert failed" };
    }

    console.log(`✅ Token stored successfully for purchase ${purchaseId}: ${token}`);

    // Return success
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, token }),
    };

  } catch (err) {
    console.error("💥 Webhook error:", err);
    return { statusCode: 500, body: "Internal server error" };
  }
}
