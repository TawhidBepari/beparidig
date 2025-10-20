import fetch from "node-fetch";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    const { product_id } = JSON.parse(event.body || "{}");
    if (!product_id) {
      console.error("❌ Missing product_id in request");
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "product_id is required" }),
      };
    }

    // ✅ Choose base URL based on mode
    const baseUrl = process.env.DODO_API_BASE || "https://test.dodopayments.com/v1";

    const res = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DODO_API_KEY}`,
      },
      body: JSON.stringify({
        product_id,
        success_url: "https://beparidig.netlify.app/thank-you",
        cancel_url: "https://beparidig.netlify.app",
      }),
    });

    const data = await res.json();

    if (!res.ok || !data?.checkout_url) {
      console.error("❌ Dodo API error:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Dodo checkout failed", details: data }),
      };
    }

    console.log("✅ Created checkout:", data.checkout_url);
    return {
      statusCode: 200,
      body: JSON.stringify({ checkout_url: data.checkout_url }),
    };
  } catch (err) {
    console.error("🔥 createCheckout fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: err.message }),
    };
  }
}
