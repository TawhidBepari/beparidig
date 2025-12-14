import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token
    if (!token) {
      return { statusCode: 400, body: 'Missing token' }
    }

    // 1️⃣ Fetch token safely
    const { data: tokenRow, error } = await supabase
      .from('download_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (error || !tokenRow) {
      return { statusCode: 403, body: 'Invalid or expired token' }
    }

    // 2️⃣ Atomically mark token as used
    const { error: updateError, count } = await supabase
      .from('download_tokens')
      .update({ used: true })
      .eq('token', token)
      .eq('used', false)
      .select('id', { count: 'exact' })

    if (updateError || count !== 1) {
      return { statusCode: 403, body: 'Token already used' }
    }

    // 3️⃣ Download file from private bucket
    const { data: file, error: fileError } = await supabase
      .storage
      .from('Products')
      .download(tokenRow.file_path)

    if (fileError || !file) {
      return { statusCode: 404, body: 'File not found' }
    }

    // 4️⃣ Convert to buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = tokenRow.file_path.split('/').pop()

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    }

  } catch (err) {
    console.error('downloadFile error:', err)
    return { statusCode: 500, body: 'Server error' }
  }
}
