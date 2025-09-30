const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { email, product_slug, order_id, amount, affiliate_id } = body;

    if (!email || !product_slug || !order_id) {
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // find product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .single();

    if (prodErr || !product) {
      return { statusCode: 400, body: 'Product not found' };
    }

    // insert purchase
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        product_id: product.id,
        amount,
        affiliate_id: affiliate_id || null,
        fulfilled: true
      })
      .select()
      .single();

    if (purchaseErr) {
      console.error('purchaseErr', purchaseErr);
      return { statusCode: 500, body: 'Failed to record purchase' };
    }

    // create download token
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await supabase
      .from('download_tokens')
      .insert({
        token,
        purchase_id: purchase.id,
        file_path: product.file_path,
        expires_at
      });

    if (tokenErr) {
      console.error('tokenErr', tokenErr);
      return { statusCode: 500, body: 'Failed to create token' };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Purchase recorded', token })
    };
  } catch (err) {
    console.error('handler error', err);
    return { statusCode: 500, body: 'Error processing webhook' };
  }
};