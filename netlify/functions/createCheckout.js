// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto"; // ✅ for generating unique placeholder tokens

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
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const apiKey = process.env.DODO_API_KEY;
    const baseUrl =
      process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("🛒 Creating Dodo checkout:", { baseUrl, product_id });

    // ✅ Send checkout creation request to Dodo
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
        // ✅ Use correct placeholders as per Dodo docs
        success_url:
          "https://beparidig.netlify.app/thank-you?purchase_id={CHECKOUT_SESSION_ID}&payment_id={PAYMENT_ID}&status={STATUS}",
        cancel_url: "https://beparidig.netlify.app",
      }),
    });

    const data = await response.json();
    console.log("🧾 Dodo API response:", data);

    // ✅ Extract checkout session info
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

    // ✅ Pre-store placeholder record in Supabase (fix NOT NULL constraint)
    try {
      const tempToken = crypto.randomUUID(); // generate a placeholder token

      const { error: insertError } = await supabase
        .from("download_tokens")
        .insert([
          {
            purchase_id: checkoutId,
            token: tempToken, // ✅ non-null temporary token
            file_path: null,
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

    // ✅ Return checkout URL to frontend
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
