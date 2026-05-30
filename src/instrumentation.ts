/**
 * Called once when the Next.js server starts, before any requests are handled.
 */
import { logAppOriginBoot } from "@/lib/url/app-origin";
import { logSupabaseEnvBoot } from "@/lib/supabase/validate-supabase-env";
import { validateSupabaseProjectConsistency } from "@/lib/supabase/supabase-project-consistency";
import { probeBuildJobEventsTable } from "@/lib/build/probe-build-job-events-table";

export function register() {
  const consistency = validateSupabaseProjectConsistency();

  if (!consistency.ok) {
    console.error("[DreamOS86][supabase-project] consistency check failed:", {
      errors: consistency.errors,
      warnings: consistency.warnings,
      urlProjectRef: consistency.urlProjectRef,
      expectedGoogleRedirectUri: consistency.expectedGoogleRedirectUri,
    });
  } else if (consistency.warnings.length > 0) {
    console.warn("[DreamOS86][supabase-project]", consistency.warnings);
  }

  if (process.env.NODE_ENV === "development") {
    // Windows dev: Node must use the OS trust store for Supabase CDN TLS (never disable verification).
    if (!process.env.NODE_USE_SYSTEM_CA) {
      process.env.NODE_USE_SYSTEM_CA = "1";
    }
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      console.warn(
        "[dreamos] NODE_TLS_REJECT_UNAUTHORIZED=0 is set — remove it. Use NODE_USE_SYSTEM_CA=1 instead.",
      );
    }
    logAppOriginBoot();
    logSupabaseEnvBoot();
    void probeBuildJobEventsTable();
  } else {
    void probeBuildJobEventsTable();
  }
}
