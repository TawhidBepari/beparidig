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

    // 1. Validate token
    const { data: tokenRow, error } = await supabase
      .from('download_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !tokenRow) {
      return { statusCode: 403, body: 'Invalid or expired token' }
    }

    // 2. Download file from private storage
    const { data: file, error: fileError } = await supabase
      .storage
      .from('Products')
      .download(tokenRow.file_path)

    if (fileError) {
      return { statusCode: 404, body: 'File not found' }
    }

    // 3. Mark token as used
    await supabase
      .from('download_tokens')
      .update({ used: true })
      .eq('token', token)

    // 4. Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${tokenRow.file_path.split('/').pop()}"`,
        'Cache-Control': 'no-store'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    }
  } catch (err) {
    return { statusCode: 500, body: 'Server error' }
  }
}
