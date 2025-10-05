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
    const body = event.body;

    // Paddle sends signature header
    const signature = event.headers["paddle-signature"];
    if (!signature) {
      return { statusCode: 400, body: "Missing Paddle signature" };
    }

    // Verify webhook authenticity
    const hmac = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (hmac !== signature) {
      return { statusCode: 401, body: "Invalid signature" };
    }

    const payload = JSON.parse(body);

    // Check event type (only trigger on successful payments)
    const eventType = payload.event_type || payload.eventType || payload.type;
    if (eventType === "transaction.completed" || eventType === "transaction.paid") {
      const customerEmail =
        payload.data?.customer?.email || payload.data?.user_email || "unknown";

      console.log(`✅ Verified Paddle payment for ${customerEmail}`);

      // Here you can handle delivery logic, e.g. create a temporary download URL.
      // For now we just return success so Paddle knows the webhook worked.
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
