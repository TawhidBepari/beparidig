import fs from "fs";
import path from "path";

const TOKENS_FILE = path.resolve("./tokens/tokens.json");

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ valid: false }) };
    }

    // Read existing tokens
    let tokens = {};
    if (fs.existsSync(TOKENS_FILE)) {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE));
    }

    const expiry = tokens[token];

    if (!expiry) {
      // Token does not exist
      return { statusCode: 200, body: JSON.stringify({ valid: false }) };
    }

    if (Date.now() > expiry) {
      // Token expired — remove it
      delete tokens[token];
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens));
      return { statusCode: 200, body: JSON.stringify({ valid: false }) };
    }

    // Token is valid
    return { statusCode: 200, body: JSON.stringify({ valid: true }) };
  } catch (err) {
    console.error("Error in validateToken:", err);
    return { statusCode: 500, body: JSON.stringify({ valid: false }) };
  }
}
