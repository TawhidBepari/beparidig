import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { email, password } = JSON.parse(event.body || "{}");

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing credentials" })
      };
    }

    // 1️⃣ Look up admin
    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, email, password_hash")
      .eq("email", email)
      .maybeSingle();

    if (error || !admin) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: "Invalid login" })
      };
    }

    // 2️⃣ Check password hash
    const ok = await bcrypt.compare(password, admin.password_hash);

    if (!ok) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: "Invalid login" })
      };
    }

    // 3️⃣ Create secure session token
    const token = crypto.randomBytes(32).toString("hex");

    const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(); // 8 hours

    await supabase.from("admin_sessions").insert({
      admin_id: admin.id,
      token,
      expires_at
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        token
      })
    };

  } catch (err) {
    console.error("admin-login error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: "Server error" })
    };
  }
}
