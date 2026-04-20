const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  try {
    const { email, product_id, plan_id, type } = JSON.parse(event.body);

    if (!email || !product_id || !type) {
      return { statusCode: 400, body: "Missing fields" };
    }

    const { error } = await supabase
      .from("installment_requests")
      .insert([{
        email,
        product_id,
        plan_id: plan_id || null,
        type // "paypal" or "installment"
      }]);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
