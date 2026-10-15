import fs from "node:fs";

// Load local Supabase settings; refuse to run against anything but a local stack.
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error(`Access tests only run against local Supabase (got "${url}").`);
}
