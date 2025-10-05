// netlify/functions/paddleWebhook.js

import crypto from "crypto";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  try {
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
    const signature = event.headers["paddle-signature"];

    // Detect sandbox by NODE_ENV or environment variable (adjust if needed)
    const isSandbox = process.env.NODE_ENV !== "production";

    if (!isSandbox) {
      // Production: verify signature
      if (!signature) {
        return { statusCode: 400, body: "Missing Paddle signature" };
      }

      const hmac = crypto
        .createHmac("sha256", webhookSecret)
        .update(event.body)
        .digest("hex");

      if (hmac !== signature) {
        return { statusCode: 401, body: "Invalid signature" };
      }
    } else {
      console.log("⚠️ Sandbox mode — skipping signature verification");
    }

    // Parse webhook payload
    const payload = JSON.parse(event.body);

    // Log the full payload for sandbox debugging
    console.log("Webhook payload:", payload);

    // Only handle successful payments
    const eventType = payload.event_type || payload.eventType || payload.type;
    if (eventType === "transaction.completed" || eventType === "transaction.paid") {
      const customerEmail =
        payload.data?.customer?.email || payload.data?.user_email || "unknown";

      console.log(`✅ Verified Paddle payment for ${customerEmail}`);

      // TODO: Add temporary download link logic here

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "Webhook received and verified",
        }),
      };
    }

    // Ignore other event types
    return {
      statusCode: 200,
      body: JSON.stringify({ ignored: true }),
    };
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}
