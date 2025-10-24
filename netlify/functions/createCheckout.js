// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto"; // ✅ added safely, needed only for UUID generation

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
        // ✅ Keep redirect logic untouched
        return_url:
          "https://beparidig.netlify.app/thank-you?purchase_id={SESSION_ID}",
        cancel_url: "https://beparidig.netlify.app",
      }),
    });

    const data = await response.json();
    console.log("🧾 Dodo API response:", data);

    // ✅ Dodo returns session_id instead of checkout_id
    const checkoutId = data.session_id;
    const checkoutUrl = data.checkout_url;

    if (!response.ok || !checkoutId || !checkoutUrl) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Failed to create checkout",
          details: data,
        }),
      };
    }

    // ✅ Pre-store placeholder record in Supabase
    try {
      const tempToken = crypto.randomUUID(); // ✅ Non-null temporary token

      const { error: insertError } = await supabase.from("download_tokens").insert([
        {
          purchase_id: checkoutId,
          token: tempToken, // ✅ fixes the NOT NULL constraint issue
          file_path: null,
          expires_at: null,
          used: false,
        },
      ]);

      if (insertError)
        console.warn("⚠️ Supabase insert warning:", insertError);
      else
        console.log("✅ Placeholder record added for purchase_id:", checkoutId);
    } catch (dbErr) {
      console.error("⚠️ Failed to insert placeholder in Supabase:", dbErr);
    }

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
