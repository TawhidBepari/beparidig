// netlify/functions/paddleWebhook.js
import crypto from "crypto";

export async function handler(event) {
  // Verify Paddle sends a POST request
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    // Parse the payload from Paddle
    const data = JSON.parse(event.body);

    // ✅ Verify the webhook signature (replace with your Paddle webhook secret)
    const signature = data.signature;
    delete data.signature;

    const serialized = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join("&");

    const hash = crypto
      .createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET)
      .update(serialized)
      .digest("hex");

    if (hash !== signature) {
      console.error("Invalid signature");
      return { statusCode: 403, body: "Invalid signature" };
    }

    // Handle only successful payments
    if (
      data.alert_name === "payment_succeeded" ||
      data.alert_name === "order.completed"
    ) {
      const buyerEmail = data.email;
      const affiliate = data.affiliate; // if any

      // Generate a temporary signed link (placeholder)
      // We'll implement this properly in the next step
      const fileUrl = "https://beparidig.com/files/50-AI-Prompts.pdf";
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour validity

      // For now, just log it — later we’ll send the email or create a token
      console.log("Delivering to:", buyerEmail, "Affiliate:", affiliate);

      // Respond OK so Paddle knows it succeeded
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Payment received",
          download: fileUrl,
          expiresAt,
        }),
      };
    }

    return { statusCode: 200, body: "Ignored event" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
}
