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

    const { id } = JSON.parse(event.body);

    const { error } = await supabase
      .from("installment_plans")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false })
    };
  }
};
