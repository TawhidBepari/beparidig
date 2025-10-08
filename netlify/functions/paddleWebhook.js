import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function handler(event) {
  try {
    const body = JSON.parse(event.body);

    // Only handle completed payments
    if (body.event_type !== "transaction.completed") {
      console.log("Ignoring event:", body.event_type);
      return { statusCode: 200, body: "Ignored non-completed event" };
    }

    const data = body.data;
    const purchaseId = data.id;
    const buyerEmail = data.customer?.email ?? null;
    const priceId = data.items?.[0]?.price?.id ?? null; // Product identifier
    const affiliateId = data.affiliate?.id ?? null; // Optional: for tracking affiliates

    if (!buyerEmail || !priceId) {
      console.error("❌ Missing email or priceId in Paddle webhook");
      return { statusCode: 400, body: "Missing required data" };
    }

    // --- 1️⃣ Detect which product was purchased ---
    let filePath = null;
    switch (priceId) {
      case "pri_01k5b696s0bvmk13jgtdzc3q3q":
        filePath = "downloads/50-ai-prompts.pdf";
        break;

      // Example for future products 👇
      // case "pri_abc456":
      //   filePath = "downloads/100-ai-prompts.pdf";
      //   break;

      default:
        console.error("❌ Unknown priceId:", priceId);
        return { statusCode: 400, body: "Unknown product" };
    }

    // --- 2️⃣ Generate secure download token (valid for 12h) ---
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours

    const { error } = await supabase.from('download_tokens').insert({
      purchase_id: purchaseId,
      file_path: filePath,
      token,
      expires_at: expiresAt,
      used: false,
      affiliate_id: affiliateId ?? null, // optional
    });

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { statusCode: 500, body: "Supabase insert failed" };
    }

    // --- 3️⃣ Email the download link ---
    const downloadLink = `https://beparidig.netlify.app/download.html?token=${token}`;

    const emailHtml = `
      <div style="font-family:Arial, sans-serif; color:#222; max-width:600px;">
        <h2 style="color:#111;">Thank you for your purchase!</h2>
        <p>You can download your copy of <strong>“50 AI Prompts to Grow Your Business in 2025”</strong> using the button below.</p>
        <p>
          <a href="${downloadLink}" style="background:#007b55; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px;">
            Download Now
          </a>
        </p>
        <p>This download link will stay active for <strong>12 hours</strong>. After that, it will automatically expire.</p>
        <hr style="margin:24px 0;"/>
        <p style="font-size:14px;color:#555;">If you have any issues, reply to this email for support.</p>
        <p style="font-size:13px;color:#777;">— BEPARI DIG Team</p>
      </div>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BEPARI DIG <support@beparidig.com>",
        to: [buyerEmail],
        subject: "Your BEPARI DIG Download Link",
        html: emailHtml,
      }),
    });

    console.log(`✅ Email sent to ${buyerEmail} for product ${priceId} (affiliate: ${affiliateId || "none"})`);
    return { statusCode: 200, body: "OK" };

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { statusCode: 500, body: "Webhook processing error" };
  }
}
