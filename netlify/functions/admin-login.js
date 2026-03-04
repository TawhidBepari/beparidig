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

    console.log("Incoming login attempt");
    console.log("Email received:", email);
    console.log("Password received:", password);

    if (!email || !password) {
      console.log("Missing credentials");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, message: "Missing credentials" })
      };
    }

    // lookup admin
    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, email, password_hash")
      .eq("email", email)
      .maybeSingle();

    console.log("Admin lookup result:", admin);
    console.log("Lookup error:", error);

    if (error || !admin) {
      console.log("Admin not found");
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, message: "Invalid login" })
      };
    }

    console.log("Stored hash:", admin.password_hash);

    const valid = await bcrypt.compare(password, admin.password_hash);

    console.log("Password match result:", valid);

    if (!valid) {
      console.log("Password mismatch");
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, message: "Invalid login" })
      };
    }

    console.log("Password valid. Creating session...");

    // create session token
    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

    const { error: sessionError } = await supabase
      .from("admin_sessions")
      .insert({
        admin_id: admin.id,
        token,
        expires_at
      });

    console.log("Session insert error:", sessionError);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        token
      })
    };

  } catch (err) {
    console.error("admin-login fatal error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, message: "Server error" })
    };
  }
}
