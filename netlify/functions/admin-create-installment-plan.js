const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    const token = event.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const { data: session } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("token", token)
      .single();

    if (!session) {
      return { statusCode: 401, body: "Invalid session" };
    }

    const body = JSON.parse(event.body);

    const { product_id, name, installments_count, installment_price, intervals } = body;

    const { error } = await supabase.from("installment_plans").insert([
      {
        product_id,
        name,
        installments_count,
        installment_price,
        intervals,
        active: true
      }
    ]);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: err.message })
    };
  }
};
