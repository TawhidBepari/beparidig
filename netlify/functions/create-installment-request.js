const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const email = body.email;
    const product_id = body.product_id;
    const plan_id = body.plan_id || null;
    const type = body.type;

    if (!email || !product_id || !type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing fields" })
      };
    }

    const { error } = await supabase
      .from("installment_requests")
      .insert([{
        email,
        product_id,
        plan_id,
        type
      }]);

    if (error) {
      console.error(error);
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
