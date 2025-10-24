// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto"; // used only to create a safe temporary token

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
    // Dodo product id (pdt_...)
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const apiKey = process.env.DODO_API_KEY;
    const baseUrl =
      process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("🛒 Creating Dodo checkout:", { baseUrl, product_id });

    // Create checkout on Dodo
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
        // leaving return_url exactly as you had it
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

    // ----------- NEW: get product.file_path from Supabase --------------
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
    // ------------------------------------------------------------------

    // Pre-store placeholder record in Supabase (make sure token & file_path are non-null)
    try {
      const tempToken = crypto.randomUUID();

      const { error: insertError } = await supabase.from("download_tokens").insert([
        {
          purchase_id: checkoutId,
          token: tempToken,         // non-null placeholder token
          file_path: filePath,      // non-null file_path (from products or fallback)
          expires_at: null,
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

    // Return checkout URL (unchanged)
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
