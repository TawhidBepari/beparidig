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

    const params = event.queryStringParameters || {};
    const txn =
      params.txn ||
      params.transaction_id ||
      params.purchase_id ||
      params.checkout_id ||
      null;

    if (!txn) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Missing transaction ID' }),
      };
    }

    console.log('🔍 Looking up token for purchase_id:', txn);

    // Wait a short moment in case Supabase hasn’t finished writing
    await new Promise((r) => setTimeout(r, 1000));

    const { data, error } = await supabase
      .from('download_tokens')
      .select('token, file_path, expires_at, used, created_at')
      .eq('purchase_id', txn)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ Supabase select error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Database query failed' }),
      };
    }

    if (!data) {
      console.warn('⚠️ No matching download token yet for transaction:', txn);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message:
            'No download available yet. Please wait a few seconds and refresh this page.',
        }),
      };
    }

    const now = new Date();
    const expiresAt = new Date(data.expires_at);

    if (data.used) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'Download link already used. Please contact support if needed.',
        }),
      };
    }

    if (now > expiresAt) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'This download link has expired. Please contact support.',
        }),
      };
    }

    const fileUrl = `${process.env.SITE_URL || 'https://beparidig.netlify.app'}/${data.file_path}`;
    console.log(`✅ Found token for ${txn}. File: ${fileUrl}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        token: data.token,
        file: fileUrl,
        expires_at: data.expires_at,
      }),
    };
  } catch (err) {
    console.error('❌ getTokenByTxn error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'Server error while validating purchase.',
      }),
    };
  }
}
