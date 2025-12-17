import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token;
    if (!token) {
      return json(400, { success: false });
    }

    const { data, error } = await supabase
      .from("download_tokens")
      .select("expires_at")
      .eq("token", token)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) {
      return json(403, { success: false });
    }

    return json(200, {
      success: true,
      expires_at: data.expires_at
    });

  } catch (err) {
    console.error("validateToken error:", err);
    return json(500, { success: false });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
