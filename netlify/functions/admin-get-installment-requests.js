const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  try {
    const token = event.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    // ✅ VERIFY ADMIN SESSION
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("token", token)
      .single();

    if (!session) {
      return { statusCode: 401, body: "Invalid session" };
    }

    // ✅ GET REQUESTS + JOIN PRODUCT + PLAN
    const { data, error } = await supabase
      .from("installment_requests")
      .select(`
        id,
        email,
        type,
        product_id,
        plan_id,
        created_at,
        products ( name ),
        installment_plans ( name )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "Could not fetch requests"
    };
  }
};
