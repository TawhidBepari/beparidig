// /.netlify/functions/getTokenByCheckout.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const checkout_id = event.queryStringParameters?.checkout_id;

    if (!checkout_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing checkout_id" }),
      };
    }

    // 1️⃣ Find purchase
    const { data: purchase, error: purchaseErr } = await supabase
      .from("purchases")
      .select("id")
      .eq("provider_checkout_id", checkout_id)
      .maybeSingle();

    if (purchaseErr || !purchase) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Purchase not ready yet" }),
      };
    }

    // 2️⃣ Find token for this purchase
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("download_tokens")
      .select("token, file_path, expires_at")
      .eq("purchase_id", purchase.id)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return {
        statusCode: 200,
        body: JSON.stringify({ token: null }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        token: tokenRow.token,
        file: tokenRow.file_path,
        expires_at: tokenRow.expires_at,
      }),
    };
  } catch (err) {
    console.error("getTokenByCheckout error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
}
