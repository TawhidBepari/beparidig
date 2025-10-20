// netlify/functions/createCheckout.js
import fetch from "node-fetch";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const DODO_API_BASE = process.env.DODO_API_BASE || "https://api.dodopayments.com/v1";
    const DODO_API_KEY = process.env.DODO_API_KEY;

    if (!DODO_API_KEY) {
      console.error("❌ Missing DODO_API_KEY in environment variables");
      return { statusCode: 500, body: JSON.stringify({ error: "Server misconfiguration" }) };
    }

    // ✅ Your product ID from Dodo
    const productId = "pdt_2QXXpIv3PY3vC8qzG4QO7";

    // ✅ Define your thank-you URL (Dodo will redirect here after payment)
    const successUrl = "https://beparidig.netlify.app/thank-you.html";

    // ✅ Create checkout session
    const response = await fetch(`${DODO_API_BASE}/checkout/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DODO_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_id: productId,
        redirect_url: successUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Dodo API error:", data);
      return { statusCode: response.status, body: JSON.stringify(data) };
    }

    console.log("✅ Checkout created successfully:", data);

    return {
      statusCode: 200,
      body: JSON.stringify({ checkout_url: data.checkout_url })
    };
  } catch (err) {
    console.error("🔥 Fatal createCheckout error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
}
