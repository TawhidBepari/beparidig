// netlify/functions/createCheckout.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Parse request body (if you ever add dynamic product later)
    const body = JSON.parse(event.body || "{}");
    const affiliate_id = body.affiliate_id || null;
    const customer_email = body.customer_email || null;

    // Fixed product id for this product
    const product_id = "pdt_2QXXpIv3PY3vC8qzG4QO7";

    // Build checkout session payload
    const payload = {
      business_id: process.env.DODO_BUSINESS_ID,
      product_cart: [{ product_id, quantity: 1 }],
      // redirect buyer back to your thank-you page
      return_url: `${process.env.SITE_URL}/thank-you`,
      metadata: { product_id, affiliate_id },
      customer: customer_email ? { email: customer_email } : undefined,
    };

    // Call Dodo API to create checkout
    const response = await fetch(`${process.env.DODO_API_BASE}/v1/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DODO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (!response.ok) {
      console.error("❌ Dodo API error:", text);
      return { statusCode: 502, body: `Dodo API error: ${text}` };
    }

    const data = JSON.parse(text);

    // Dodo may return different field names for the URL
    const checkout_url =
      data.checkout_url ||
      data.url ||
      data.redirect_url ||
      (data?.data && data.data.url);

    if (!checkout_url) {
      console.error("❌ Unexpected Dodo response:", data);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Unexpected Dodo response", raw: data }),
      };
    }

    console.log("✅ Checkout URL created:", checkout_url);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_url }),
    };
  } catch (err) {
    console.error("🔥 createCheckout error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
}
