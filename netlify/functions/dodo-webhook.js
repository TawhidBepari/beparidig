import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ✅ Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // ✅ Log header + method for debugging
    console.log('🔔 Incoming Dodo webhook:', {
      method: event.httpMethod,
      headers: event.headers,
    });

    // ✅ Optional: Verify Dodo webhook signature (if Dodo provides it)
    const signature = event.headers['x-dodo-signature'];
    const secret = process.env.DODO_WEBHOOK_SECRET;
    if (secret && signature) {
      try {
        const expected = crypto
          .createHmac('sha256', secret)
          .update(event.body)
          .digest('hex');

        if (expected !== signature) {
          console.warn('⚠️ Invalid Dodo signature');
          return { statusCode: 401, body: 'Invalid signature' };
        }
      } catch (sigErr) {
        console.error('❌ Signature verification failed:', sigErr);
        return { statusCode: 400, body: 'Bad signature verification' };
      }
    } else {
      console.log('⚠️ No Dodo signature verification applied.');
    }

    // ✅ Parse incoming data
    const body = JSON.parse(event.body || '{}');
    console.log('📦 Webhook payload:', body);

    const { email, product_slug, order_id, amount, affiliate_id } = body;

    if (!email || !product_slug || !order_id) {
      console.warn('⚠️ Missing required fields');
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // ✅ Find product in Supabase
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .single();

    if (prodErr || !product) {
      console.error('❌ Product not found', prodErr);
      return { statusCode: 404, body: 'Product not found' };
    }

    // ✅ Record the purchase
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        product_id: product.id,
        amount,
        affiliate_id: affiliate_id || null,
        fulfilled: true,
      })
      .select()
      .single();

    if (purchaseErr) {
      console.error('❌ Failed to record purchase', purchaseErr);
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    // ✅ Create download token (valid for 24h)
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await supabase.from('download_tokens').insert({
      token,
      purchase_id: purchase.id,
      file_path: product.file_path,
      expires_at,
      used: false,
    });

    if (tokenErr) {
      console.error('❌ Failed to create token', tokenErr);
      return { statusCode: 500, body: 'Failed to create download token' };
    }

    console.log(`✅ Dodo purchase processed successfully: ${order_id}`);

    // ✅ Return success
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Purchase recorded successfully',
        token,
        product_slug,
      }),
    };
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}
