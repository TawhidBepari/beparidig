// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");

    // ✅ Extract product_id and optional referral ID
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const referral_id = body.referral_id || body.ref || null;

    const apiKey = process.env.DODO_API_KEY;
    const baseUrl =
      process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("🛒 Creating Dodo checkout:", { baseUrl, product_id, referral_id });

    // ✅ Build checkout request payload
    const checkoutPayload = {
      product_cart: [
        {
          product_id,
          quantity: 1,
        },
      ],
      return_url:
        "https://beparidig.netlify.app/thank-you?purchase_id={SESSION_ID}",
      cancel_url: "https://beparidig.netlify.app",
    };

    // If user came from affiliate link, add metadata
    if (referral_id) {
      checkoutPayload.metadata = { referral_id };
    }

    // ✅ Create checkout session in Dodo
    const response = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const data = await response.json();
    console.log("🧾 Dodo API response:", data);

    const checkoutId = data.session_id;
    const checkoutUrl = data.checkout_url;

    if (!response.ok || !checkoutId || !checkoutUrl) {
      console.error("❌ Failed to create checkout:", data);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Failed to create checkout",
          details: data,
        }),
      };
    }

    // ----------------------------------------------------------------------
    // ✅ Retrieve product info from Supabase
    // ----------------------------------------------------------------------
    let filePath = process.env.DEFAULT_FILE_PATH || "downloads/AI-Prompt.pdf";
    try {
      const { data: productRow, error: prodErr } = await supabase
        .from("products")
        .select("id, file_path")
        .eq("dodo_product_id", product_id)
        .limit(1)
        .maybeSingle();

      if (prodErr) {
        console.warn("⚠️ Could not lookup product in Supabase:", prodErr);
      } else if (productRow && productRow.file_path) {
        filePath = productRow.file_path;
      }
    } catch (err) {
      console.error("⚠️ Error reading product:", err);
    }

    // ----------------------------------------------------------------------
    // ✅ Pre-store placeholder in download_tokens
    // ----------------------------------------------------------------------
    try {
      const tempToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      const { error: insertError } = await supabase.from("download_tokens").insert([
        {
          purchase_id: checkoutId,
          token: tempToken,
          file_path: filePath,
          expires_at: expiresAt,
          used: false,
        },
      ]);

      if (insertError)
        console.warn("⚠️ Supabase insert warning (download_tokens):", insertError);
    } catch (dbErr) {
      console.error("⚠️ Failed to insert placeholder:", dbErr);
    }

    // ----------------------------------------------------------------------
    // ✅ If referral_id present → store temporary affiliate_commission record
    // ----------------------------------------------------------------------
    if (referral_id) {
      try {
        const { error: affErr } = await supabase
          .from("affiliate_commissions")
          .insert([
            {
              referral_id,
              purchase_id: checkoutId,
              amount: 0, // will be updated on webhook confirmation
              status: "pending",
            },
          ]);

        if (affErr)
          console.warn("⚠️ Supabase insert warning (affiliate_commissions):", affErr);
        else
          console.log("✅ Affiliate referral recorded:", referral_id);
      } catch (affCatch) {
        console.error("⚠️ Failed to record affiliate referral:", affCatch);
      }
    }

    // ----------------------------------------------------------------------
    // ✅ Return checkout URL (redirect)
    // ----------------------------------------------------------------------
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_url: checkoutUrl }),
    };
  } catch (err) {
    console.error("🔥 createCheckout fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
