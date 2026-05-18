import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Supabase client with the service role secret. SERVER ROUTES / SERVER ACTIONS ONLY.
 * Never import this file from client components, shared hooks, or Zustand stores.
 */
export type SupabaseAdminClient = SupabaseClient<Database>;

export function createSupabaseAdmin(): SupabaseAdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url?.trim()) {
    throw new Error("createSupabaseAdmin: NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!secret?.trim()) {
    throw new Error(
      "createSupabaseAdmin: SUPABASE_SECRET_KEY is missing. Add it to server env only (never NEXT_PUBLIC_*).",
    );
  }

  return createClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
