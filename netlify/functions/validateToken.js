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

    const token = event.queryStringParameters?.token || null;
    if (!token) {
      console.error('❌ Missing token in request');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Missing token' }),
      };
    }

    console.log(`🔍 Checking token: ${token}`);

    const { data, error: selectError } = await supabase
      .from('download_tokens')
      .select('file_path, expires_at, used')
      .eq('token', token)
      .maybeSingle();

    if (selectError) {
      console.error('❌ Supabase select error:', selectError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'DB error' }),
      };
    }

    if (!data) {
      console.warn('⚠️ Invalid token — no matching row found.');
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Invalid token' }),
      };
    }

    const now = new Date();
    const expiresAt = new Date(data.expires_at);

    if (now > expiresAt) {
      console.warn(`⚠️ Token expired at ${expiresAt.toISOString()}`);
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Token expired' }),
      };
    }

    const fileUrl = `${process.env.SITE_URL || 'https://beparidig.netlify.app'}/${data.file_path}`;
    console.log(`✅ Token validated successfully. File: ${fileUrl}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        file: fileUrl,
        expires_at: expiresAt.toISOString(),
      }),
    };
  } catch (err) {
    console.error('🔥 validateToken fatal error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Server error' }),
    };
  }
}
