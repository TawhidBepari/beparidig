// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto"; // used only to create a safe temporary token

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
    // ✅ Default Dodo product id if none provided
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const apiKey = process.env.DODO_API_KEY;
    const baseUrl =
      process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("🛒 Creating Dodo checkout:", { baseUrl, product_id });

    // ✅ Create checkout session in Dodo
    const response = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        product_cart: [
          {
            product_id,
            quantity: 1,
          },
        ],
        // ✅ Your working return and cancel URLs — do not change
        return_url:
          "https://beparidig.netlify.app/thank-you?purchase_id={SESSION_ID}",
        cancel_url: "https://beparidig.netlify.app",
      }),
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
    // ✅ Retrieve file_path from Supabase (fallback if missing)
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
      } else {
        console.warn(
          `⚠️ product row missing or file_path empty for dodo_product_id=${product_id}; using fallback ${filePath}`
        );
      }
    } catch (err) {
      console.error("⚠️ Error while reading product from Supabase:", err);
    }

    // ----------------------------------------------------------------------
    // ✅ Pre-store placeholder in download_tokens
    // ----------------------------------------------------------------------
    try {
      const tempToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h expiry placeholder

      const { error: insertError } = await supabase.from("download_tokens").insert([
        {
          purchase_id: checkoutId,
          token: tempToken,       // non-null placeholder token
          file_path: filePath,    // valid file path
          expires_at: expiresAt,  // non-null placeholder expiry
          used: false,
        },
      ]);

      if (insertError) {
        console.warn("⚠️ Supabase insert warning:", insertError);
      } else {
        console.log("✅ Placeholder record added for purchase_id:", checkoutId);
      }
    } catch (dbErr) {
      console.error("⚠️ Failed to insert placeholder in Supabase:", dbErr);
    }

    // ----------------------------------------------------------------------
    // ✅ Return checkout URL — ensures redirect continues working
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
