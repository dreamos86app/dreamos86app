import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getSupabaseServiceRoleKey } from "./service-role-key";

/** Service-role client shape used across admin routes. */
export type SupabaseAdminClient = SupabaseClient<Database>;

/**
 * Service-role client for server routes only. Never import in client bundles.
 * Returns null when `SUPABASE_SERVICE_ROLE_KEY` is not set.
 */
export function createServiceRoleClient(): SupabaseAdminClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getSupabaseServiceRoleKey();
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Service-role client; throws if service role key is missing.
 * Use in routes that already handle failures via try/catch.
 */
export function createSupabaseAdmin(): SupabaseAdminClient {
  const client = createServiceRoleClient();
  if (!client) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is not configured");
  }
  return client;
}
