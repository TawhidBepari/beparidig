// netlify/functions/validateToken.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function handler(event) {
  try {
    const { token } = event.queryStringParameters || {};

    if (!token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing token" }),
      };
    }

    // Check token in Supabase
    const { data, error } = await supabase
      .from("download_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, message: "Invalid token" }),
      };
    }

    // Validate expiry
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    if (now > expiresAt) {
      return {
        statusCode: 410,
        body: JSON.stringify({ success: false, message: "Token expired" }),
      };
    }

    if (data.used) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: "Token already used" }),
      };
    }

    // Mark token as used
    await supabase
      .from("download_tokens")
      .update({ used: true })
      .eq("token", token);

    // Return secure file URL (you can later serve from S3 or Supabase Storage)
    const fileUrl = `https://beparidig.netlify.app/downloads/AI-Prompt.pdf`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Token valid",
        file: fileUrl,
      }),
    };
  } catch (err) {
    console.error("validateToken error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: "Server error" }),
    };
  }
}
