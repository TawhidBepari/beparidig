import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, reason: "missing_token" })
      };
    }

    // 1️⃣ Look up active session
    const { data: session, error } = await supabase
      .from("admin_sessions")
      .select("id, expires_at, admin_id, admins(email)")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !session) {
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, reason: "invalid_or_expired" })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        admin_email: session.admins.email
      })
    };

  } catch (err) {
    console.error("admin-verify-session error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, reason: "server_error" })
    };
  }
}
