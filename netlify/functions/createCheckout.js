// ✅ /netlify/functions/createCheckout.js
import { createClient } from "@supabase/supabase-js";

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
    const baseUrl = process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

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
        success_url: "https://beparidig.netlify.app/thank-you?purchase_id={CHECKOUT_ID}",
        cancel_url: "https://beparidig.netlify.app",
      }),
    });

    const data = await response.json();
    console.log("🧾 Dodo API response:", data);

    if (!response.ok || !data.checkout_id || !data.checkout_url) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Failed to create checkout",
          details: data,
        }),
      };
    }

    // ✅ Pre-store placeholder in Supabase
    try {
      const { error: insertError } = await supabase
        .from("download_tokens")
        .insert([
          {
            purchase_id: data.checkout_id,
            token: null,
            file_path: null,
            expires_at: null,
            used: false,
          },
        ]);

      if (insertError)
        console.warn("⚠️ Supabase insert warning:", insertError);
      else
        console.log("✅ Placeholder record added for purchase_id:", data.checkout_id);
    } catch (dbErr) {
      console.error("⚠️ Failed to insert placeholder in Supabase:", dbErr);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_url: data.checkout_url }),
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
