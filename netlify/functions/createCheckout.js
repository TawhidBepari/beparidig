import fetch from 'node-fetch';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { product_id, affiliate_id, customer_email } = body;

    if (!product_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing product_id' }) };
    }

    const payload = {
      business_id: process.env.DODO_BUSINESS_ID,
      product_cart: [{ product_id: product_id, quantity: 1 }],
      return_url: `${process.env.SITE_URL}/thank-you`, // critical: tells Dodo where to redirect the browser
      metadata: { product_id, affiliate_id: affiliate_id || null },
      customer: customer_email ? { email: customer_email } : undefined
    };

    const resp = await fetch(`${process.env.DODO_API_BASE}/v1/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error('Dodo create session error:', text);
      return { statusCode: 502, body: `Dodo API error: ${text}` };
    }

    const data = JSON.parse(text);
    // expected reply contains a checkout url - inspect and adapt if field name differs
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout_url: data.checkout_url || data.url || data.checkout_url_raw || data })
    };
  } catch (err) {
    console.error('createCheckout error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
}
