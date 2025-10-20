// netlify/functions/createCheckout.js

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const DODO_API_BASE = process.env.DODO_API_BASE;
    const DODO_API_KEY = process.env.DODO_API_KEY;
    const DODO_BUSINESS_ID = process.env.DODO_BUSINESS_ID;

    if (!DODO_API_BASE || !DODO_API_KEY || !DODO_BUSINESS_ID) {
      console.error("❌ Missing Dodo environment variables");
      return { statusCode: 500, body: "Missing configuration" };
    }

    // Example product_id — you already gave me yours ✅
    const product_id = "pdt_2QXXpIv3PY3vC8qzG4QO7";

    // Call Dodo API to create a checkout session
    const response = await fetch(`${DODO_API_BASE}/checkouts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DODO_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        business_id: DODO_BUSINESS_ID,
        product_id,
        success_url: "https://beparidig.netlify.app/thank-you",
        cancel_url: "https://beparidig.netlify.app/",
      }),
    });

    const data = await response.json();

    if (!response.ok || !data?.checkout_url) {
      console.error("❌ Dodo API error", data);
      return { statusCode: 500, body: JSON.stringify({ error: "Dodo API error", details: data }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ checkout_url: data.checkout_url })
    };

  } catch (err) {
    console.error("🔥 createCheckout error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
}
