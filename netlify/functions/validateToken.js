import { createClient } from "@supabase/supabase-js";

// ✅ Use the EXISTING Netlify env var
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== "GET") {
      return json(405, { error: "Method not allowed" });
    }

    const token = event.queryStringParameters?.token;

    if (!token) {
      return json(400, { error: "Missing token" });
    }

    const { data: tokenRow, error } = await supabase
      .from("download_tokens")
      .select("token, expires_at")
      .eq("token", token)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !tokenRow) {
      return json(403, { success: false });
    }

    return json(200, {
      success: true,
      expires_at: tokenRow.expires_at,
      downloadUrl: `/.netlify/functions/download-file?token=${token}`,
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
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
