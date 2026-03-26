import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const token = event.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: "Unauthorized" })
      };
    }

    // ✅ verify admin session
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!session) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: "Invalid session" })
      };
    }

    const {
      name,
      slug,
      price,
      currency,
      description,
      file_path,
      cover_image,
      dodo_product_id
    } = JSON.parse(event.body || "{}");

    if (!name || !slug || !price) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing fields" })
      };
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        slug,
        price,
        currency: currency || "USD",
        description,
        file_path,
        cover_image,
        dodo_product_id,
        active: true
      })
      .select()
      .single();

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: error.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        product: data
      })
    };

  } catch (err) {
    console.error("admin-create-product error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: "Server error" })
    };
  }
}
