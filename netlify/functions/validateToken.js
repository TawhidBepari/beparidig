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

    const token = (event.queryStringParameters && event.queryStringParameters.token) || null;
    if (!token) {
      console.error('❌ Missing token in request');
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Missing token' }) };
    }

    console.log(`🔍 Checking token: ${token}`);

    const { data, error: selectError } = await supabase
      .from('download_tokens')
      .select('file_path, expires_at, used')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.error('❌ Supabase select error:', selectError);
      return { statusCode: 500, body: JSON.stringify({ success: false, message: 'DB error' }) };
    }

    if (!data) {
      console.warn('⚠️ Invalid token — no matching row found.');
      return { statusCode: 404, body: JSON.stringify({ success: false, message: 'Invalid token' }) };
    }

    const now = new Date();
    const expiresAt = new Date(data.expires_at);

    if (data.used) {
      console.warn('⚠️ Token already used');
      return { statusCode: 403, body: JSON.stringify({ success: false, message: 'Token already used' }) };
    }

    if (now > expiresAt) {
      console.warn(`⚠️ Token expired at ${expiresAt.toISOString()}`);
      return { statusCode: 410, body: JSON.stringify({ success: false, message: 'Token expired' }) };
    }

    // Mark token as used
    const { error: updateError } = await supabase
      .from('download_tokens')
      .update({ used: true })
      .eq('token', token);

    if (updateError) {
      console.error('❌ Supabase update error:', updateError);
      return { statusCode: 500, body: JSON.stringify({ success: false, message: 'DB update failed' }) };
    }

    const fileUrl = `${process.env.SITE_URL || 'https://beparidig.netlify.app'}/${data.file_path}`;
    console.log(`✅ Token validated successfully. File: ${fileUrl}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, file: fileUrl })
    };
  } catch (err) {
    console.error('🔥 validateToken fatal error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Server error' }) };
  }
}
