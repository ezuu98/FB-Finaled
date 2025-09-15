import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !anonKey) {
  // Intentionally not throwing to avoid SSR import crashes; surfaces clearly in console during development.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}

export const supabase = createClient(url, anonKey);
