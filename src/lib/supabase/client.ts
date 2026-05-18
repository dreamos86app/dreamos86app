/**
 * DreamOS86 — Supabase Browser Client
 *
 * Use this in Client Components. Creates a singleton to avoid re-instantiating
 * on every render. Reads env vars at build time via Next.js public env handling.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;
let cachedUrl: string | undefined;
let cachedKey: string | undefined;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "[DreamOS86] Missing Supabase environment variables.\n\n" +
        "Copy .env.local.example → .env.local and fill in your project URL and anon key.\n" +
        "Get them from: https://supabase.com/dashboard/project/_/settings/api",
    );
  }

  // Recreate client when env changes (e.g. after editing .env.local) so OAuth never hits a stale project URL.
  if (client && cachedUrl === url && cachedKey === key) return client;

  client = createBrowserClient<Database>(url, key);
  cachedUrl = url;
  cachedKey = key;
  return client;
}
