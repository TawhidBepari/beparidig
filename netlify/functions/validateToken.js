import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return json(400, { error: "Missing token" });
    }

    const { data: tokenRow, error } = await supabase
      .from("download_tokens")
      .select("*")
      .eq("token", token)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !tokenRow) {
      return json(403, { error: "Invalid or expired token" });
    }

    return json(200, {
      success: true,
      downloadUrl: `/.netlify/functions/download-file?token=${token}`,
    });
  } catch (err) {
    console.error("validateToken error:", err);
    return json(500, { error: "Server error" });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
