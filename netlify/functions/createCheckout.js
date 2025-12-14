import { createClient } from "@supabase/supabase-js";

// ✅ Initialize Supabase client (still useful for future extensions)
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

    console.log("🛒 Creating Dodo checkout:", {
      product_id,
      referral_code,
      baseUrl,
    });

    // ✅ Build checkout payload for Dodo
    const checkoutPayload = {
      product_cart: [{ product_id, quantity: 1 }],
      return_url: "https://beparidig.netlify.app/thank-you?purchase_id={SESSION_ID}",
      cancel_url: "https://beparidig.netlify.app",
    };

    // ✅ Attach referral code to metadata (used later by webhook)
    if (referral_code) {
      checkoutPayload.metadata = { referral_code };
    }

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

    // ✅ SUCCESS — return checkout URL to frontend
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_url: checkoutUrl,
      }),
    };
  } catch (err) {
    console.error("🔥 createCheckout fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error" }),
    };
  }
}
