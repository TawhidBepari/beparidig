import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const purchase_id = event.queryStringParameters?.purchase_id;
    if (!purchase_id) {
      return json(400, { token: null });
    }

    const { data: purchase } = await supabase
      .from("purchases")
      .select("id")
      .eq("provider_checkout_id", purchase_id)
      .maybeSingle();

    if (!purchase) {
      return json(200, { token: null });
    }

    const { data: tokenRow } = await supabase
      .from("download_tokens")
      .select("token")
      .eq("purchase_id", purchase.id)
      .eq("used", false)
      .maybeSingle();

    return json(200, {
      token: tokenRow?.token || null
    });

  } catch (err) {
    console.error("getTokenByTxn error:", err);
    return json(500, { token: null });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
