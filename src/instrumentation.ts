/**
 * Called once when the Next.js server starts, before any requests are handled.
 *
 * On Windows, Node.js cannot verify some intermediate CA certificates that
 * Supabase's CDN uses. This causes server-side fetch to supabase.co to fail with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE, breaking PKCE code exchange and SC data loads.
 *
 * NEVER enabled in production.
 */
const EXPECTED_SUPABASE_PROJECT_REF = "xycqutvqxtkbszytaxbe";

export function register() {
  if (process.env.NODE_ENV === "development") {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.warn(
        "[DreamOS86][dev] NODE_TLS_REJECT_UNAUTHORIZED=0 for local Node server only (Supabase TLS). NOT used in production.",
      );
    }
  }

  if (process.env.NODE_ENV === "development") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const matchesExpected = url.includes(EXPECTED_SUPABASE_PROJECT_REF);
    console.info(
      "[DreamOS86][env] NEXT_PUBLIC_SUPABASE_URL=%s | expectedRef=%s | match=%s | NEXT_PUBLIC_APP_URL=%s",
      url || "(unset)",
      EXPECTED_SUPABASE_PROJECT_REF,
      String(matchesExpected),
      process.env.NEXT_PUBLIC_APP_URL ?? "(unset)",
    );
  }
}
