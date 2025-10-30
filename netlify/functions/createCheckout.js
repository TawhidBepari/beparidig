import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ✅ Initialize Supabase client
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

    // ✅ Extract product_id and optional affiliate referral code
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const referral_code = body.referral_id || body.ref || null;

    const apiKey = process.env.DODO_API_KEY;
    const baseUrl =
      process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("🛒 Creating Dodo checkout:", { baseUrl, product_id, referral_code });

    // ✅ Build checkout payload for Dodo
    const checkoutPayload = {
      product_cart: [{ product_id, quantity: 1 }],
      return_url: "https://beparidig.netlify.app/thank-you?purchase_id={SESSION_ID}",
      cancel_url: "https://beparidig.netlify.app",
    };

    if (referral_code) checkoutPayload.metadata = { referral_code };

    // ✅ Create checkout via Dodo API
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
    // ✅ Insert placeholder into download_tokens
    // ----------------------------------------------------------------------
    try {
      const tempToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      const { error: insertError } = await supabase.from("download_tokens").insert([
        {
          purchase_id: checkoutId,
          file_path: filePath,
          token: tempToken,
          expires_at: expiresAt,
          used: false,
          product_id: productRow?.id || null, // ✅ fixes null product_id
        },
      ]);

      if (insertError)
        console.warn("⚠️ Supabase insert warning (download_tokens):", insertError);
      else
        console.log("✅ Placeholder added in download_tokens for purchase_id:", checkoutId);
    } catch (dbErr) {
      console.error("⚠️ Failed to insert placeholder in Supabase:", dbErr);
    }

    // ----------------------------------------------------------------------
    // ✅ If affiliate referral exists, store commission placeholder
    // ----------------------------------------------------------------------
    if (referral_code) {
      try {
        console.log("🧩 Resolving affiliate by code:", referral_code);

        // Find affiliate by referral code
        const { data: affRow, error: affLookupErr } = await supabase
          .from("affiliates")
          .select("id")
          .eq("code", referral_code)
          .limit(1)
          .maybeSingle();

        if (affLookupErr) {
          console.warn("⚠️ Affiliate lookup error:", affLookupErr);
        } else if (!affRow || !affRow.id) {
          console.warn("⚠️ No affiliate found with code:", referral_code);
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
                referral_id: referral_code,
                status: "pending",
              },
            ])
            .select();

          if (insertErr)
            console.warn("⚠️ Supabase insert warning (affiliate_commissions):", insertErr);
          else
            console.log("✅ Affiliate commission placeholder inserted:", insertData);
        }
      } catch (affCatch) {
        console.error("⚠️ Failed to record affiliate referral:", affCatch);
      }
    }

    // ----------------------------------------------------------------------
    // ✅ Return checkout URL to frontend
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
