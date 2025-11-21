// /netlify/functions/getTokenByTxn.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const transaction_id = event.queryStringParameters?.transaction_id;

    if (!transaction_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing transaction_id" }),
      };
    }

    console.log("🔍 Looking up token for transaction:", transaction_id);

    // ---------------------------------------------------------
    // Step 1: Find purchase by provider_order_id (Dodo pay_...)
    // ---------------------------------------------------------
    const { data: purchase, error: purchaseErr } = await supabase
      .from("purchases")
      .select("id, product_id")
      .eq("provider_order_id", transaction_id)
      .single();

    if (purchaseErr || !purchase) {
      console.warn("⚠️ No purchase found:", transaction_id);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Purchase not found" }),
      };
    }

    // ---------------------------------------------------------
    // Step 2: Fetch token linked to THIS purchase
    // ---------------------------------------------------------
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("download_tokens")
      .select("token, file_path, expires_at, used")
      .eq("purchase_id", purchase.id)   // 🔥 DIRECT MATCH
      .eq("product_id", purchase.product_id)
      .single();

    if (tokenErr) {
      console.error("❌ Token lookup error:", tokenErr);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Error while finding token" }),
      };
    }

    if (!tokenRow) {
      console.warn("⚠️ Token not created yet for purchase:", purchase.id);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Token not created yet",
          token: null,
        }),
      };
    }

    // ---------------------------------------------------------
    // Step 3: Return token
    // ---------------------------------------------------------
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
    console.error("🔥 Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
