import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bootstrapProfileFromOAuth } from "@/lib/auth/profile-bootstrap";
import { ensureUserProfileServer } from "@/lib/auth/ensure-user-profile-server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isPostgrestSchemaOrMissingTableError } from "@/lib/supabase/schema-errors";
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
  email: string | null;
};

function isCompleteRow(r: unknown): r is ProfileBillingRow {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return typeof o.credits_remaining === "number" && !Number.isNaN(o.credits_remaining);
}

/**
 * Loads plan + token balance for billing checks.
 * Falls back to service-role + bootstrap when the user JWT query returns nothing
 * (missing row, RLS oddities, or stale PostgREST schema) — avoids treating balance as 0.
 */
export async function loadProfileBillingRow(
  supabase: SupabaseClient,
  user: User,
): Promise<{ row: ProfileBillingRow | null; hint?: string }> {
  await ensureUserProfileServer(user.id, user.email ?? null);

  const { data: userRow, error: userErr } = await supabase
    .from("profiles")
    .select("plan_id, credits_remaining, credits_reset_at, email")
    .eq("id", user.id)
    .maybeSingle();

  if (userErr && process.env.NODE_ENV !== "production") {
    console.warn("[profile-billing] user client:", userErr.message);
  }

  if (userErr && isPostgrestSchemaOrMissingTableError(userErr.message)) {
    const fallbackCredits = Number(process.env.PROFILE_BILLING_FALLBACK_CREDITS ?? String(FREE_PLAN_TOKEN_CAP));
    return {
      row: capFreePlanBalance({
        plan_id: "free",
        credits_remaining: Number.isFinite(fallbackCredits) ? fallbackCredits : FREE_PLAN_TOKEN_CAP,
        credits_reset_at: null,
        email: user.email ?? null,
      }),
      hint:
        "Could not read profiles from the API (schema cache). Using a temporary token balance — reload PostgREST schema in Supabase.",
    };
  }

  if (isCompleteRow(userRow)) {
    return {
      row: capFreePlanBalance({
        plan_id: userRow.plan_id ?? null,
        credits_remaining: userRow.credits_remaining,
        credits_reset_at:
          typeof userRow.credits_reset_at === "string" ? userRow.credits_reset_at : null,
        email: userRow.email ?? null,
      }),
    };
  }

  try {
    await bootstrapProfileFromOAuth(user, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isPostgrestSchemaOrMissingTableError(msg)) {
      const fallbackCredits = Number(process.env.PROFILE_BILLING_FALLBACK_CREDITS ?? String(FREE_PLAN_TOKEN_CAP));
      return {
        row: capFreePlanBalance({
          plan_id: "free",
          credits_remaining: Number.isFinite(fallbackCredits) ? fallbackCredits : FREE_PLAN_TOKEN_CAP,
          credits_reset_at: null,
          email: user.email ?? null,
        }),
        hint:
          "PostgREST reports profiles as missing — using a temporary token balance. Run migrations and execute NOTIFY pgrst, 'reload schema'; in Supabase SQL.",
      };
    }
    return {
      row: null,
      hint:
        msg.includes("profiles") || msg.includes("schema")
          ? "Run Supabase migrations (see supabase/migrations) and reload the PostgREST schema, or confirm SUPABASE_SERVICE_ROLE_KEY is set."
          : msg,
    };
  }

  try {
    const admin = createSupabaseAdmin();
    const { data: adminRow, error: adminErr } = await admin
      .from("profiles")
      .select("plan_id, credits_remaining, credits_reset_at, email")
      .eq("id", user.id)
      .maybeSingle();

    if (adminErr) {
      if (isPostgrestSchemaOrMissingTableError(adminErr.message)) {
        const fallbackCredits = Number(process.env.PROFILE_BILLING_FALLBACK_CREDITS ?? "5000");
        return {
          row: {
            plan_id: "free",
            credits_remaining: Number.isFinite(fallbackCredits) ? fallbackCredits : 5000,
            credits_reset_at: null,
            email: user.email ?? null,
          },
          hint:
            "PostgREST schema cache may be stale — using a temporary token balance until NOTIFY pgrst, 'reload schema'; is applied.",
        };
      }
      return { row: null, hint: adminErr.message };
    }

    if (isCompleteRow(adminRow)) {
      return {
        row: capFreePlanBalance({
          plan_id: adminRow.plan_id ?? null,
          credits_remaining: adminRow.credits_remaining,
          credits_reset_at:
            typeof adminRow.credits_reset_at === "string" ? adminRow.credits_reset_at : null,
          email: adminRow.email ?? null,
        }),
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      row: null,
      hint: msg.includes("SUPABASE_SERVICE_ROLE_KEY")
        ? "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (server only)."
        : msg,
    };
  }

  return {
    row: null,
    hint: "No profile row after bootstrap — apply migrations for public.profiles.",
  };
}
