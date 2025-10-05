// netlify/functions/paddleWebhook.js
import crypto from "crypto";
import fs from "fs";
import path from "path";

const TOKENS_FILE = path.resolve("./tokens/tokens.json");
const DOWNLOAD_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  try {
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
    const signature = event.headers["paddle-signature"];
    const isSandbox = process.env.NODE_ENV !== "production";

    if (!isSandbox) {
      if (!signature) return { statusCode: 400, body: "Missing Paddle signature" };
      const hmac = crypto.createHmac("sha256", webhookSecret).update(event.body).digest("hex");
      if (hmac !== signature) return { statusCode: 401, body: "Invalid signature" };
    } else {
      console.log("⚠️ Sandbox mode — skipping signature verification");
    }

    const payload = JSON.parse(event.body);
    console.log("Webhook payload:", payload);

    const eventType = payload.event_type || payload.eventType || payload.type;
    if (eventType === "transaction.completed" || eventType === "transaction.paid") {
      const customerEmail =
        payload.data?.customer?.email || payload.data?.user_email || "unknown";
      console.log(`✅ Verified Paddle payment for ${customerEmail}`);

      // Generate token
      const token = crypto.randomBytes(8).toString("hex");
      const expiry = Date.now() + DOWNLOAD_DURATION_MS;

      // Read existing tokens
      let tokens = {};
      if (fs.existsSync(TOKENS_FILE)) {
        tokens = JSON.parse(fs.readFileSync(TOKENS_FILE));
      }

      // Save new token
      tokens[token] = expiry;
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens));

      console.log(`Generated token for download: ${token} (expires in 24h)`);

      return { statusCode: 200, body: JSON.stringify({ success: true, token }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ignored: true }) };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
}
