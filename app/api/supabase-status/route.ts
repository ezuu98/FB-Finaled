import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.getSession();
  return NextResponse.json({ ok: true, hasSession: !!data?.session, error: error?.message ?? null });
}
