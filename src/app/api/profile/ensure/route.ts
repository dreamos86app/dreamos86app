import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { bootstrapProfileFromOAuth } from "@/lib/auth/profile-bootstrap";
import { ensureUserProfileServer } from "@/lib/auth/ensure-user-profile-server";
import { isPostgrestSchemaOrMissingTableError } from "@/lib/supabase/schema-errors";
import {
  loadProfileOptionalFields,
  loadUserProfileCore,
  PROFILE_REQUIRED_SELECT,
} from "@/lib/supabase/load-user-profile";

/**
 * Ensures a `public.profiles` row exists for the signed-in user (service role).
 * Never overwrites token balance or subscription fields on existing users.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const rpcEnsure = await ensureUserProfileServer(user.id, user.email ?? null);
  if (!rpcEnsure.ok) {
    try {
      await bootstrapProfileFromOAuth(user, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "bootstrap_failed";
      const status = isPostgrestSchemaOrMissingTableError(msg) ? 503 : 500;
      return NextResponse.json(
        {
          error: "Profile bootstrap failed",
          code: isPostgrestSchemaOrMissingTableError(msg) ? "schema_error" : "bootstrap_failed",
          hint: msg.includes("profiles")
            ? msg
            : `${msg} — ensure public.profiles exists (run Supabase migrations).`,
        },
        { status },
      );
    }
  }

  try {
    const admin = createSupabaseAdmin();
    const { profile: core, schemaDegraded } = await loadUserProfileCore(admin, user.id);
    if (!core) {
      const { data, error } = await admin
        .from("profiles")
        .select(PROFILE_REQUIRED_SELECT)
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          {
            error: "Could not load profile",
            hint: error.message,
            code: isPostgrestSchemaOrMissingTableError(error.message)
              ? "schema_error"
              : "profile_read_failed",
          },
          { status: 500 },
        );
      }
      const optional = await loadProfileOptionalFields(admin, user.id);
      const row = data as Record<string, unknown> | null;
      return NextResponse.json({
        profile: row ? { ...row, ...optional } : null,
        schemaDegraded,
      });
    }
    return NextResponse.json({ profile: core, schemaDegraded });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "admin_unavailable";
    return NextResponse.json(
      {
        error: "Profile service unavailable",
        hint: `${msg}. Set SUPABASE_SERVICE_ROLE_KEY for server bootstrap.`,
        code: "service_role_missing",
      },
      { status: 503 },
    );
  }
}
