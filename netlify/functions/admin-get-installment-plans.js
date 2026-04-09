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

    const { data: session } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("token", token)
      .single();

    if (!session) {
      return { statusCode: 401, body: "Invalid session" };
    }

    const { data, error } = await supabase
      .from("installment_plans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
