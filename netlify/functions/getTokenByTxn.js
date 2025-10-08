// netlify/functions/getTokenByTxn.js
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

    const txn = (event.queryStringParameters && event.queryStringParameters.txn) || null;
    if (!txn) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Missing txn param' }) };
    }

    const { data, error } = await supabase
      .from('download_tokens')
      .select('token, file_path, expires_at, used, created_at')
      .eq('purchase_id', txn)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Supabase select error:', error);
      return { statusCode: 500, body: JSON.stringify({ success: false, message: 'DB error' }) };
    }

    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ success: false, message: 'No token found' }) };
    }

    // if expired or used, return that info (front-end will show helpful message)
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    if (data.used) {
      return { statusCode: 410, body: JSON.stringify({ success: false, message: 'Token already used' }) };
    }
    if (now > expiresAt) {
      return { statusCode: 410, body: JSON.stringify({ success: false, message: 'Token expired' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        token: data.token,
        file_path: data.file_path,
        expires_at: data.expires_at
      })
    };
  } catch (err) {
    console.error('getTokenByTxn error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Server error' }) };
  }
}
