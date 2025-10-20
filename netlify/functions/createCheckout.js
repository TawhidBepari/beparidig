// ✅ /netlify/functions/createCheckout.js
export async function handler(event) {
  try {
    // Allow only POST requests
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    // Parse request body (if provided)
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      console.error("Invalid JSON body:", e);
    }

    // ✅ Use your Dodo product ID (fallback if none provided)
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7";

    // ✅ Environment variables from Netlify dashboard
    const apiKey = process.env.DODO_API_KEY;
    const baseUrl = process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    // ✅ Create checkout using native fetch (no node-fetch!)
    const response = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        product_id,
        success_url: "https://beparidig.netlify.app/thank-you",
        cancel_url: "https://beparidig.netlify.app",
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.checkout_url) {
      console.error("❌ Dodo API error:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to create checkout",
          details: data,
        }),
      };
    }

    // ✅ Success — return the checkout URL
    return {
      statusCode: 200,
      body: JSON.stringify({ checkout_url: data.checkout_url }),
    };
  } catch (err) {
    console.error("🔥 createCheckout error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
