// netlify/functions/createCheckout.js
export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Use DODO envs set in Netlify
    const API_BASE = process.env.DODO_API_BASE; // e.g. https://test.dodopayments.com
    const API_KEY = process.env.DODO_API_KEY;
    const BUSINESS_ID = process.env.DODO_BUSINESS_ID;
    const SITE_URL = process.env.SITE_URL || "https://beparidig.netlify.app";

    if (!API_BASE || !API_KEY || !BUSINESS_ID) {
      console.error("Missing Dodo config:", { API_BASE, API_KEY: !!API_KEY, BUSINESS_ID });
      return { statusCode: 500, body: JSON.stringify({ error: "Missing Dodo configuration environment variables" }) };
    }

    // Use the Dodo product id you provided
    const productId = "pdt_2QXXpIv3PY3vC8qzG4QO7";

    // Build payload; we include common fields. Dodo API may expect slightly different names —
    // sending as JSON and returning raw response will show exact format issue.
    const payload = {
      business_id: BUSINESS_ID,
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${SITE_URL}/thank-you`,   // we prefer return_url terminology
      // also include a fallback known names so we cover variations:
      success_url: `${SITE_URL}/thank-you`,
      redirect_url: `${SITE_URL}/thank-you`,
      metadata: { product_id }
    };

    console.log("Calling Dodo API:", API_BASE, "payload:", JSON.stringify(payload));

    const resp = await fetch(`${API_BASE}/v1/checkouts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const status = resp.status;
    let bodyText;
    try {
      bodyText = await resp.text();
    } catch (e) {
      bodyText = "<could not read body>";
    }

    console.log("Dodo response status:", status);
    console.log("Dodo response body:", bodyText);

    // return the raw status + body for debugging purposes
    const safeBody = (() => {
      try { return JSON.parse(bodyText); } catch { return bodyText; }
    })();

    // if not ok, return debugging info (client will show it)
    if (!resp.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          status,
          body: safeBody
        }, null, 2)
      };
    }

    // If ok, try to parse JSON and return the checkout URL if present
    let json;
    try { json = JSON.parse(bodyText); } catch (e) { json = bodyText; }

    // return everything so frontend and you can inspect exact reply
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, status, body: json }, null, 2)
    };

  } catch (err) {
    console.error("createCheckout handler error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || String(err) }) };
  }
}
