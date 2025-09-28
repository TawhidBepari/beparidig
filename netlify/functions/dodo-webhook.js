import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function handler(event) {
  try {
    // parse Dodo webhook payload
    const body = JSON.parse(event.body)

    // Optional: verify webhook signature if Dodo provides one
    // const secret = process.env.DODO_WEBHOOK_SECRET
    // ...verify body

    const { email, product_slug, order_id, amount } = body

    // 1. Get product info from Supabase
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .single()

    if (prodErr || !product) {
      return { statusCode: 400, body: 'Product not found' }
    }

    // 2. Insert purchase record
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        email,
        provider: 'dodo',
        provider_order_id: order_id,
        product_id: product.id,
        amount,
        fulfilled: true
      })
      .select()
      .single()

    if (purchaseErr) {
      return { statusCode: 500, body: 'Failed to record purchase' }
    }

    // 3. Generate download token
    const token = crypto.randomUUID()
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000) // expires in 24h

    await supabase
      .from('download_tokens')
      .insert({
        token,
        purchase_id: purchase.id,
        file_path: product.file_path,
        expires_at
      })

    // 4. Optional: send email to customer (we can add later)

    return { statusCode: 200, body: 'Purchase recorded' }
  } catch (err) {
    return { statusCode: 500, body: 'Error processing webhook' }
  }
}