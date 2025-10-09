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
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Missing token' })
      };
    }

    // Lookup the token entry
    const { data, error: selectError } = await supabase
      .from('download_tokens')
      .select('token, file_path, expires_at, used')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.error('Supabase select error:', selectError);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: 'DB error' })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Invalid token' })
      };
    }

    if (data.used) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Token already used' })
      };
    }

    if (new Date() > new Date(data.expires_at)) {
      return {
        statusCode: 410,
        body: JSON.stringify({ success: false, message: 'Token expired' })
      };
    }

    // Mark the token as used
    const { error: updateError } = await supabase
      .from('download_tokens')
      .update({ used: true })
      .eq('token', token);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: 'DB update failed' })
      };
    }

    // Construct the full file URL
    const siteUrl = process.env.SITE_URL || 'https://beparidig.netlify.app';
    const fileUrl = `${siteUrl}/${data.file_path}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        file: fileUrl
      })
    };
  } catch (err) {
    console.error('validateToken error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Server error'
      })
    };
  }
}
