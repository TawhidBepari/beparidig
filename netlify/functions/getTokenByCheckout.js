import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const checkout_id = event.queryStringParameters?.checkout_id;
    if (!checkout_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing checkout_id" }) };
    }

    // 1️⃣ Find purchase
    const { data: purchase } = await supabase
      .from("purchases")
      .select("id")
      .eq("provider_checkout_id", checkout_id)
      .maybeSingle();

    if (!purchase) {
      return { statusCode: 200, body: JSON.stringify({ token: null }) };
    }

    // 2️⃣ Find token linked to purchase
    const { data: tokenRow } = await supabase
      .from("download_tokens")
      .select("token")
      .eq("purchase_id", purchase.id)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    return {
      statusCode: 200,
      body: JSON.stringify({ token: tokenRow?.token || null })
    };
  } catch (err) {
    console.error("getTokenByCheckout error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
}
