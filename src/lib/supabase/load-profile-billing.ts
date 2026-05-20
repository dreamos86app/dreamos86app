import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bootstrapProfileFromOAuth } from "@/lib/auth/profile-bootstrap";
import { ensureUserProfileServer } from "@/lib/auth/ensure-user-profile-server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isOptionalProfileSchemaError,
  isPostgrestSchemaOrMissingTableError,
} from "@/lib/supabase/schema-errors";
import {
  PROFILE_MINIMAL_SELECT,
  PROFILE_REQUIRED_SELECT,
  loadProfileOptionalFields,
} from "@/lib/supabase/load-user-profile";
import { FREE_MONTHLY_QUOTA } from "@/lib/stores/credits-store";

const FREE_PLAN_TOKEN_CAP = FREE_MONTHLY_QUOTA;

function capFreePlanBalance(row: ProfileBillingRow): ProfileBillingRow {
  if ((row.plan_id ?? "free") !== "free") return row;
  if (row.credits_remaining <= FREE_PLAN_TOKEN_CAP) return row;
  return { ...row, credits_remaining: FREE_PLAN_TOKEN_CAP };
}

export type ProfileBillingRow = {
  plan_id: string | null;
  credits_remaining: number;
  credits_reset_at: string | null;
  credits_limit: number | null;
  plan_interval: "monthly" | "yearly";
  email: string | null;
};

function isCompleteRow(r: unknown): r is ProfileBillingRow {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return typeof o.credits_remaining === "number" && !Number.isNaN(o.credits_remaining);
}

function rowFromRecord(
  data: Record<string, unknown>,
  optional: { plan_interval: "monthly" | "yearly"; credits_reset_at: string | null },
  emailFallback: string | null,
): ProfileBillingRow {
  return {
    plan_id: typeof data.plan_id === "string" ? data.plan_id : "free",
    credits_remaining:
      typeof data.credits_remaining === "number" ? data.credits_remaining : FREE_PLAN_TOKEN_CAP,
    credits_limit:
      typeof data.credits_limit === "number" ? data.credits_limit : FREE_PLAN_TOKEN_CAP,
    credits_reset_at: optional.credits_reset_at,
    plan_interval: optional.plan_interval,
    email: typeof data.email === "string" ? data.email : emailFallback,
  };
}

function schemaFallbackRow(user: User, hint: string): { row: ProfileBillingRow; hint: string } {
  const fallbackCredits = Number(
    process.env.PROFILE_BILLING_FALLBACK_CREDITS ?? String(FREE_PLAN_TOKEN_CAP),
  );
  return {
    row: capFreePlanBalance({
      plan_id: "free",
      credits_remaining: Number.isFinite(fallbackCredits) ? fallbackCredits : FREE_PLAN_TOKEN_CAP,
      credits_limit: FREE_PLAN_TOKEN_CAP,
      credits_reset_at: null,
      plan_interval: "monthly",
      email: user.email ?? null,
    }),
    hint,
  };
}

async function queryBillingRow(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
): Promise<{ row: ProfileBillingRow | null; schemaDegraded: boolean; error?: string }> {
  let schemaDegraded = false;

  const trySelect = async (select: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(select)
      .eq("id", userId)
      .maybeSingle();
    return { data: data as Record<string, unknown> | null, error: error?.message ?? null };
  };

  let { data, error } = await trySelect(PROFILE_REQUIRED_SELECT);

  if (error && isOptionalProfileSchemaError(error)) {
    schemaDegraded = true;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[profile-billing] required columns degraded:", error);
    }
    const retry = await trySelect(PROFILE_MINIMAL_SELECT);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (isPostgrestSchemaOrMissingTableError(error) || isOptionalProfileSchemaError(error)) {
      return { row: null, schemaDegraded: true, error };
    }
    return { row: null, schemaDegraded, error };
  }

  if (!data || typeof data.credits_remaining !== "number") {
    return { row: null, schemaDegraded };
  }

  const optional = await loadProfileOptionalFields(supabase, userId);
  return {
    row: capFreePlanBalance(rowFromRecord(data, optional, userEmail)),
    schemaDegraded,
  };
}

/**
 * Loads plan + token balance for billing checks.
 * Never blocks on optional columns (plan_interval, credits_reset_at, etc.).
 */
export async function loadProfileBillingRow(
  supabase: SupabaseClient,
  user: User,
): Promise<{ row: ProfileBillingRow | null; hint?: string; schemaDegraded?: boolean }> {
  await ensureUserProfileServer(user.id, user.email ?? null);

  const userResult = await queryBillingRow(supabase, user.id, user.email ?? null);

  if (userResult.row) {
    return {
      row: userResult.row,
      schemaDegraded: userResult.schemaDegraded,
      hint: userResult.schemaDegraded
        ? "Some optional profile columns unavailable in PostgREST — using defaults."
        : undefined,
    };
  }

  if (userResult.schemaDegraded || isOptionalProfileSchemaError(userResult.error ?? "")) {
    const fb = schemaFallbackRow(
      user,
      "PostgREST schema cache may be stale — using safe billing defaults until NOTIFY pgrst, 'reload schema';",
    );
    return { row: fb.row, hint: fb.hint, schemaDegraded: true };
  }

  try {
    await bootstrapProfileFromOAuth(user, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isPostgrestSchemaOrMissingTableError(msg) || isOptionalProfileSchemaError(msg)) {
      const fb = schemaFallbackRow(user, msg);
      return { row: fb.row, hint: fb.hint, schemaDegraded: true };
    }
    return {
      row: null,
      hint:
        msg.includes("profiles") || msg.includes("schema")
          ? "Run Supabase migrations (see supabase/migrations) and reload the PostgREST schema."
          : msg,
    };
  }

  try {
    const admin = createSupabaseAdmin();
    const adminResult = await queryBillingRow(admin, user.id, user.email ?? null);
    if (adminResult.row) {
      return { row: adminResult.row, schemaDegraded: adminResult.schemaDegraded };
    }
    if (adminResult.schemaDegraded) {
      const fb = schemaFallbackRow(user, adminResult.error ?? "schema_degraded");
      return { row: fb.row, hint: fb.hint, schemaDegraded: true };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isOptionalProfileSchemaError(msg) || isPostgrestSchemaOrMissingTableError(msg)) {
      const fb = schemaFallbackRow(user, msg);
      return { row: fb.row, hint: fb.hint, schemaDegraded: true };
    }
    return {
      row: null,
      hint: msg.includes("SUPABASE_SERVICE_ROLE_KEY")
        ? "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (server only)."
        : msg,
    };
  }

  const fb = schemaFallbackRow(
    user,
    "No profile row after bootstrap — apply migrations for public.profiles.",
  );
  return { row: fb.row, hint: fb.hint, schemaDegraded: true };
}
