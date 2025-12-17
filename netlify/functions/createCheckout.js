import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";
    const referral_code = body.referral_id || null;

    const apiKey = process.env.DODO_API_KEY;
    const baseUrl = process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    const payload = {
      product_cart: [{ product_id, quantity: 1 }],
      return_url: "https://beparidig.netlify.app/thank-you.html",
      cancel_url: "https://beparidig.netlify.app"
    };

    if (referral_code) {
      payload.metadata = { referral_code };
    }

    const res = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.session_id || !data.checkout_url) {
      console.error("Dodo error:", data);
      return { statusCode: 500, body: "Checkout creation failed" };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkout_url: data.checkout_url,
        checkout_id: data.session_id
      })
    };
  } catch (err) {
    console.error("createCheckout error:", err);
    return { statusCode: 500, body: "Server error" };
  }
}
