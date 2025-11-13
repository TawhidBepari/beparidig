// ✅ /netlify/functions/cleanup-tokens.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // must be service key
);

export async function handler() {
  try {
    console.log('🧹 Cleaning up expired download tokens...');
    const { error } = await supabase
      .from('download_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('❌ Cleanup failed:', error);
      return { statusCode: 500, body: 'Cleanup failed' };
    }

    console.log('✅ Expired download tokens cleaned successfully');
    return { statusCode: 200, body: 'Cleanup complete' };
  } catch (err) {
    console.error('🔥 Fatal cleanup error:', err);
    return { statusCode: 500, body: 'Cleanup crashed' };
  }
}
