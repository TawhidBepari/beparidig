// netlify/functions/paddleWebhook.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // must be your Service Role Key
);

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    const body = JSON.parse(event.body || '{}');

    // Accept either transaction.completed or transaction.paid (safest)
    const evt = body.event_type || body.eventType;
    if (!evt || (evt !== 'transaction.completed' && evt !== 'transaction.paid')) {
      console.log('Ignored event:', evt);
      return { statusCode: 200, body: 'Ignored' };
    }

    const data = body.data || {};
    const purchaseId = data.id || null; // Paddle txn id like txn_01...
    // attempt to pull priceId/affiliate robustly
    const items = data.items || [];
    const priceId = items?.[0]?.price?.id || items?.[0]?.id || null;
    const affiliateId = (data.affiliate && data.affiliate.id) || data.affiliate_id || null;

    if (!purchaseId) {
      console.error('Missing purchase id in webhook payload', body);
      return { statusCode: 400, body: 'Missing purchase id' };
    }

    // file path for this product (you told me the filename is AI-Prompt.pdf)
    const filePath = 'downloads/AI-Prompt.pdf';

    // Generate token (32 hex chars) and 12-hour expiry
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    // Insert into Supabase
    const { error } = await supabase.from('download_tokens').insert([
      {
        purchase_id: purchaseId,
        file_path: filePath,
        token,
        expires_at: expiresAt,
        used: false,
        affiliate_id: affiliateId,
        price_id: priceId
      }
    ]);

    if (error) {
      console.error('Supabase insert error:', error);
      return { statusCode: 500, body: 'DB insert failed' };
    }

    console.log(`✅ Token created for ${purchaseId}: ${token} (expires ${expiresAt})`);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
}
