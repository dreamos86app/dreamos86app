import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";
import {
  isOptionalProfileSchemaError,
  parseMissingProfileColumn,
} from "@/lib/supabase/schema-errors";

/** Safe columns for bootstrap / Create — never include billing-only fields here. */
export const PROFILE_REQUIRED_SELECT =
  "id, email, plan_id, credits_remaining, credits_limit, onboarding_completed, workspace_name";

/** Fallback when PostgREST cache is missing newer required columns. */
export const PROFILE_MINIMAL_SELECT =
  "id, email, plan_id, credits_remaining, onboarding_completed";

/** Loaded in a second query; failures fall back to defaults. */
export const PROFILE_OPTIONAL_SELECT =
  "plan_interval, credits_reset_at, full_name, display_name, username, avatar_url, role, default_model_id, preferred_model, experience_level, credits_used, signup_wizard_completed, onboarding_step, onboarding_answers, stripe_customer_id, is_admin";

export type ProfileOptionalFields = {
  plan_interval: "monthly" | "yearly";
  credits_reset_at: string | null;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const DEFAULT_OPTIONAL: ProfileOptionalFields = {
  plan_interval: "monthly",
  credits_reset_at: null,
  full_name: null,
  display_name: null,
  username: null,
  avatar_url: null,
};

function logOptionalProfileIssue(context: string, message: string) {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[profile-loader] ${context}:`, message);
}

async function selectProfileColumns(
  supabase: SupabaseClient,
  userId: string,
  select: string,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select(select)
    .eq("id", userId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: (data as Record<string, unknown> | null) ?? null, error: null };
}

/**
 * Optional profile fields — never throws; defaults plan_interval to monthly.
 */
export async function loadProfileOptionalFields(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileOptionalFields> {
  const { data, error } = await selectProfileColumns(supabase, userId, PROFILE_OPTIONAL_SELECT);
  if (error) {
    if (isOptionalProfileSchemaError(error)) {
      logOptionalProfileIssue("optional fields skipped", error);
      const missing = parseMissingProfileColumn(error);
      if (missing === "plan_interval") {
        const { data: pi, error: piErr } = await selectProfileColumns(
          supabase,
          userId,
          "plan_interval",
        );
        if (!piErr && pi?.plan_interval) {
          return {
            ...DEFAULT_OPTIONAL,
            plan_interval:
              pi.plan_interval === "yearly" ? "yearly" : "monthly",
          };
        }
      }
      return { ...DEFAULT_OPTIONAL };
    }
    logOptionalProfileIssue("optional fields error", error);
    return { ...DEFAULT_OPTIONAL };
  }

  return {
    plan_interval: data?.plan_interval === "yearly" ? "yearly" : "monthly",
    credits_reset_at:
      typeof data?.credits_reset_at === "string" ? data.credits_reset_at : null,
    full_name: typeof data?.full_name === "string" ? data.full_name : null,
    display_name: typeof data?.display_name === "string" ? data.display_name : null,
    username: typeof data?.username === "string" ? data.username : null,
    avatar_url: typeof data?.avatar_url === "string" ? data.avatar_url : null,
  };
}

/**
 * Core profile row for session/bootstrap — tolerates stale PostgREST cache.
 */
export async function loadUserProfileCore(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: Partial<Profile> | null; schemaDegraded: boolean }> {
  let schemaDegraded = false;

  let { data, error } = await selectProfileColumns(supabase, userId, PROFILE_REQUIRED_SELECT);

  if (error && isOptionalProfileSchemaError(error)) {
    schemaDegraded = true;
    logOptionalProfileIssue("required select degraded", error);
    const retry = await selectProfileColumns(supabase, userId, PROFILE_MINIMAL_SELECT);
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    if (error && !isOptionalProfileSchemaError(error)) {
      logOptionalProfileIssue("required select failed", error);
    }
    return { profile: null, schemaDegraded };
  }

  const optional = await loadProfileOptionalFields(supabase, userId);
  if (schemaDegraded) {
    /* optional loader already logged */
  }

  const merged: Partial<Profile> = {
    id: userId,
    email: typeof data.email === "string" ? data.email : "",
    plan_id: (typeof data.plan_id === "string" ? data.plan_id : "free") as Profile["plan_id"],
    credits_remaining:
      typeof data.credits_remaining === "number" ? data.credits_remaining : 100,
    onboarding_completed: Boolean(data.onboarding_completed),
    workspace_name:
      typeof data.workspace_name === "string" ? data.workspace_name : "My Workspace",
    plan_interval: optional.plan_interval,
    credits_reset_at: optional.credits_reset_at ?? "",
    full_name: optional.full_name,
    display_name: optional.display_name,
    username: optional.username,
    avatar_url: optional.avatar_url,
    default_model_id: "automatic",
    signup_wizard_completed: false,
    total_referrals: 0,
    onboarding_answers: {},
    email_verified: false,
    is_admin: false,
  };

  return { profile: merged, schemaDegraded };
}
