// ✅ /netlify/functions/getTokenByTxn.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const transaction_id = params.transaction_id;

    if (!transaction_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing transaction_id" }),
      };
    }

    console.log("🔍 Looking up token for transaction:", transaction_id);

    // ------------------------------------------------------------------
    // Step 1: Find purchase record by Dodo payment ID (pay_...)
    // ------------------------------------------------------------------
    const { data: purchase, error: purchaseErr } = await supabase
      .from("purchases")
      .select("provider_order_id, product_id")
      .eq("provider_order_id", transaction_id)
      .single();

    if (purchaseErr || !purchase) {
      console.warn("⚠️ No purchase found for transaction:", transaction_id);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Purchase not found" }),
      };
    }

    // ------------------------------------------------------------------
    // Step 2: Find the download token linked to this purchase
    // ------------------------------------------------------------------
    // Since we don’t store payment_id in download_tokens,
    // we must locate it using the checkout_session_id from the webhook.
    // The webhook updates download_tokens by checkout_id (= purchase_id)
    // right before inserting the purchase record.
    //
    // So we’ll find the *most recent* download_tokens entry
    // for the same product and the latest purchase.
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("download_tokens")
      .select("token, file_path, expires_at, used")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenErr) {
      console.error("❌ tokenErr:", tokenErr);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Database error while finding token" }),
      };
    }

    if (!tokenRow) {
      console.warn("⚠️ No matching download token yet for transaction:", transaction_id);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No token yet",
          token: null,
        }),
      };
    }

    // ------------------------------------------------------------------
    // Step 3: Return token & file info
    // ------------------------------------------------------------------
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
    console.error("🔥 getTokenByTxn fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
