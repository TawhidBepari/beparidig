// netlify/functions/validateToken.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    const token = event.queryStringParameters?.token;
    if (!token) {
      return { statusCode: 400, body: 'Missing token' };
    }

    // 1️⃣ Get token record
    const { data: record, error } = await supabase
      .from('download_tokens')
      .select('id, file_path, expires_at, used')
      .eq('token', token)
      .single();

    if (error || !record) {
      return { statusCode: 404, body: 'Invalid token' };
    }

    if (record.used) {
      return { statusCode: 410, body: 'Token already used' };
    }

    if (new Date() > new Date(record.expires_at)) {
      return { statusCode: 410, body: 'Token expired' };
    }

    // 2️⃣ Mark token as used immediately
    await supabase
      .from('download_tokens')
      .update({ used: true })
      .eq('id', record.id);

    // 3️⃣ Fetch file from PRIVATE Supabase Storage
    // file_path example: products/50-ai-prompts.pdf
    const bucket = 'products';

    const { data: file, error: downloadError } =
      await supabase.storage.from(bucket).download(record.file_path);

    if (downloadError) {
      return { statusCode: 500, body: 'File download failed' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = record.file_path.split('/').pop();

    // 4️⃣ Stream file to browser (forced download)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (err) {
    console.error('validateToken error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
}
