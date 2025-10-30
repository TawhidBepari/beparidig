// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ✅ Initialize Supabase
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

    // ✅ Extract product_id and optional referral ID (affiliate code)
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const referral_id = body.referral_id || body.ref || null;

    const apiKey = process.env.DODO_API_KEY;
    const baseUrl =
      process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("🛒 Creating Dodo checkout:", { baseUrl, product_id, referral_id });

    // ✅ Build checkout request payload
    const checkoutPayload = {
      product_cart: [{ product_id, quantity: 1 }],
      return_url:
        "https://beparidig.netlify.app/thank-you?purchase_id={SESSION_ID}",
      cancel_url: "https://beparidig.netlify.app",
    };

    if (referral_id) checkoutPayload.metadata = { referral_id };

    // ✅ Create checkout in Dodo
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
    let productRow = null;
    try {
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("id, file_path")
        .eq("dodo_product_id", product_id)
        .limit(1)
        .maybeSingle();

      if (prodErr) console.warn("⚠️ Could not lookup product:", prodErr);
      else if (prodData) {
        productRow = prodData;
        if (prodData.file_path) filePath = prodData.file_path;
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
      else
        console.log("✅ Placeholder record added for purchase_id:", checkoutId);
    } catch (dbErr) {
      console.error("⚠️ Failed to insert placeholder:", dbErr);
    }

    // ----------------------------------------------------------------------
    // ✅ If referral_id present → find affiliate and insert commission record
    // ----------------------------------------------------------------------
    if (referral_id) {
      try {
        console.log("🧩 Resolving affiliate by code:", referral_id);

        // Find affiliate by code
        const { data: affRow, error: affLookupErr } = await supabase
          .from("affiliates")
          .select("id")
          .eq("code", referral_id)
          .limit(1)
          .maybeSingle();

        if (affLookupErr) {
          console.warn("⚠️ Error looking up affiliate:", affLookupErr);
        }

        if (!affRow || !affRow.id) {
          console.warn("⚠️ No affiliate found with code:", referral_id);
        } else {
          const affiliateId = affRow.id;
          console.log("✅ Found affiliate id:", affiliateId);

          const { error: insertErr, data: insertData } = await supabase
            .from("affiliate_commissions")
            .insert([
              {
                affiliate_id: affiliateId,
                purchase_id: checkoutId,
                product_id: productRow?.id || null,
                amount: 0,
              },
            ])
            .select();

          if (insertErr)
            console.warn("⚠️ Supabase insert warning (affiliate_commissions):", insertErr);
          else
            console.log("✅ Affiliate commission placeholder inserted:", insertData);
        }
      } catch (affCatch) {
        console.error("⚠️ Failed to record affiliate referral (exception):", affCatch);
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
