// ✅ /netlify/functions/createCheckout.js
export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const product_id = body.product_id || "pdt_2QXXpIv3PY3vC8qzG4QO7"; // your Dodo product ID
    const apiKey = process.env.DODO_API_KEY;
    const baseUrl = process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    console.log("Creating Dodo checkout:", { baseUrl, product_id });

    // ✅ Correct Dodo body structure
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
            quantity: 1
          }
        ],
        success_url: "https://beparidig.netlify.app/thank-you",
        cancel_url: "https://beparidig.netlify.app"
      }),
    });

    const data = await response.json();
    console.log("Dodo API response:", data);

    if (!response.ok || !data.checkout_url) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to create checkout",
          details: data,
        }),
      };
    }

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
