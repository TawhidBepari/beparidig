import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESEND_API_KEY = process.env.RESEND_API_KEY; // You’ll add this to Netlify env vars

export async function handler(event) {
  try {
    const body = JSON.parse(event.body);

    // Safety: handle only completed transactions
    if (body.event_type !== "transaction.completed") {
      console.log("Ignoring event:", body.event_type);
      return { statusCode: 200, body: "Ignored non-completed event" };
    }

    const data = body.data;
    const purchaseId = data.id;
    const buyerEmail = data.customer?.email ?? null;

    if (!buyerEmail) {
      console.error("❌ Missing buyer email in Paddle webhook");
      return { statusCode: 400, body: "Missing buyer email" };
    }

    // Create secure download token (valid for 24h)
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('download_tokens').insert({
      purchase_id: purchaseId,
      file_path: 'downloads/50-ai-prompts.pdf',
      token,
      expires_at: expiresAt,
      used: false
    });

    if (error) {
      console.error("❌ Supabase insert error:", error);
      return { statusCode: 500, body: "Supabase insert failed" };
    }

    // Email download link
    const downloadLink = `https://beparidig.netlify.app/download.html?token=${token}`;

    const emailHtml = `
      <div style="font-family:Arial, sans-serif; color:#222; max-width:600px;">
        <h2 style="color:#111;">Thank you for your purchase!</h2>
        <p>You can download your copy of <strong>“50 AI Prompts to Grow Your Business in 2025”</strong> using the link below.</p>
        <p><a href="${downloadLink}" style="background:#007b55; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px;">Download Now</a></p>
        <p>This link will stay active for <strong>24 hours</strong>. After that, it will automatically expire.</p>
        <hr/>
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

    console.log(`✅ Download email sent to ${buyerEmail}`);
    return { statusCode: 200, body: "OK" };

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return { statusCode: 500, body: "Webhook processing error" };
  }
}
