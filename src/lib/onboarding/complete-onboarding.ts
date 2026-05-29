import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  applyReferralForNewUser,
  grantReferralRewards,
} from "@/lib/referrals/apply-referral";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isMissingProfileColumnError,
  isPostgrestSchemaOrMissingTableError,
  parseMissingProfileColumn,
} from "@/lib/supabase/schema-errors";
import type { Json } from "@/lib/supabase/types";
import { ONBOARDING_MIGRATION_FILE } from "@/lib/onboarding/schema";

const ONBOARDING_HINT = `${ONBOARDING_MIGRATION_FILE} or scripts/complete-onboarding-schema.sql in Supabase SQL Editor`;

export type CompleteOnboardingInput = {
  hearAbout: string;
  buildFirst: string;
  promoCode?: string;
  replay?: boolean;
};

export type CompleteOnboardingResult =
  | { ok: true; alreadyCompleted?: boolean; referralClaim?: unknown }
  | { ok: false; status: number; error: string; code?: string; hint?: string };

function schemaErrorPayload(message: string): CompleteOnboardingResult {
  const missingTable = message.toLowerCase().includes("could not find the table");
  const missingCol = parseMissingProfileColumn(message);
  return {
    ok: false,
    status: missingTable || missingCol || message.toLowerCase().includes("schema cache") ? 503 : 500,
    error: message,
    code: missingTable
      ? "schema_table_missing"
      : missingCol
        ? "schema_column_missing"
        : "onboarding_failed",
    hint: `Run ${ONBOARDING_HINT}`,
  };
}

async function loadCompletionState(
  admin: SupabaseClient,
  userId: string,
): Promise<{ profileDone: boolean; onboardingDone: boolean }> {
  const [{ data: profile }, { data: onboarding }] = await Promise.all([
    admin
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("onboarding")
      .select("completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profileDone = profile?.onboarding_completed === true;
  const onboardingDone = Boolean(onboarding?.completed_at);

  return { profileDone, onboardingDone };
}

/** Prefer security-definer RPC; fall back to PostgREST upsert when RPC is not deployed. */
async function persistOnboarding(
  admin: SupabaseClient,
  user: User,
  input: CompleteOnboardingInput,
  answers: Json,
  now: string,
): Promise<CompleteOnboardingResult> {
  const promo = input.promoCode?.trim().toUpperCase() ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcErr } = await (admin as any).rpc("complete_user_onboarding", {
    p_user_id: user.id,
    p_hear_about: input.hearAbout,
    p_build_first: input.buildFirst,
    p_promo_code: promo || null,
    p_answers: answers,
    p_replay: input.replay === true,
  });

  if (!rpcErr) {
    const row = rpcData as { success?: boolean; error?: string; already_completed?: boolean } | null;
    if (row?.success === false && row.error) {
      return { ok: false, status: 500, error: row.error, code: "rpc_failed" };
    }
    return { ok: true, alreadyCompleted: row?.already_completed === true };
  }

  const rpcMissing =
    rpcErr.message.includes("complete_user_onboarding") ||
    rpcErr.message.includes("Could not find the function") ||
    rpcErr.code === "PGRST202";

  if (!rpcMissing) {
    return schemaErrorPayload(rpcErr.message);
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    completed_at: now,
    onboarding_completed_at: now,
    completed: true,
    onboarding_completed: true,
    current_step: 4,
    step: 4,
    onboarding_step: 4,
    workspace_name: null,
    experience_level: null,
    preferred_model: "automatic",
    default_model_id: "automatic",
    referral_source: input.hearAbout,
    heard_about_us: input.hearAbout,
    use_case: input.buildFirst,
    build_goal: input.buildFirst,
    promo_code: promo || null,
    answers,
    data: answers,
    updated_at: now,
  };

  const { error: upsertErr } = await admin
    .from("onboarding")
    .upsert(payload, { onConflict: "user_id", ignoreDuplicates: false });

  if (upsertErr) {
    if (
      upsertErr.message.includes("duplicate key") ||
      upsertErr.code === "23505"
    ) {
      const { error: updateErr } = await admin
        .from("onboarding")
        .update({
          completed_at: now,
          completed: true,
          onboarding_completed: true,
          referral_source: input.hearAbout,
          use_case: input.buildFirst,
          answers,
          data: answers,
          updated_at: now,
        })
        .eq("user_id", user.id);
      if (updateErr) return schemaErrorPayload(updateErr.message);
    } else {
      return schemaErrorPayload(upsertErr.message);
    }
  }

  const profilePatch: Record<string, unknown> = {
    onboarding_completed: true,
    onboarding_completed_at: now,
    onboarding_step: 4,
    onboarding_answers: answers,
    use_case: input.buildFirst,
    signup_wizard_completed: true,
    experience_level: null,
    preferred_model: "automatic",
    default_model_id: "automatic",
  };

  const { error: profileErr } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", user.id);

  if (profileErr) {
    if (isMissingProfileColumnError(profileErr.message)) {
      const minimal = {
        onboarding_completed: true,
        onboarding_completed_at: now,
        use_case: input.buildFirst,
      };
      const { error: minimalErr } = await admin
        .from("profiles")
        .update(minimal)
        .eq("id", user.id);
      if (minimalErr) return schemaErrorPayload(minimalErr.message);
    } else {
      return schemaErrorPayload(profileErr.message);
    }
  }

  return { ok: true };
}

export async function completeOnboardingForUser(
  user: User,
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  let admin: SupabaseClient;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "service_role_missing";
    return {
      ok: false,
      status: 503,
      error: "Profile service unavailable",
      code: "service_role_missing",
      hint: msg,
    };
  }

  const now = new Date().toISOString();
  const promo = input.promoCode?.trim().toUpperCase() ?? "";

  const { profileDone, onboardingDone } = await loadCompletionState(admin, user.id);
  if ((profileDone || onboardingDone) && !input.replay) {
    return { ok: true, alreadyCompleted: true };
  }

  if (promo) {
    const applied = await applyReferralForNewUser({
      newUserId: user.id,
      referralCode: promo,
      source: "onboarding",
      operationId: `onboarding_promo:${user.id}`,
    });
    if (!applied.ok) {
      return { ok: false, status: 500, error: applied.error, code: applied.error };
    }
    if (!applied.applied && applied.reason === "code_not_found") {
      return { ok: false, status: 404, error: applied.reason, code: applied.reason };
    }
    if (
      !applied.applied &&
      (applied.reason === "self_referral" || applied.reason === "referral_limit_reached")
    ) {
      return { ok: false, status: 400, error: applied.reason, code: applied.reason };
    }
  }

  const answers = {
    hear_about: input.hearAbout,
    build_first: input.buildFirst,
    promo_code: promo || null,
    completed_at: now,
  } as Json;

  const persisted = await persistOnboarding(admin, user, input, answers, now);
  if (!persisted.ok) return persisted;

  const { data: referralRow } = await admin
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", user.id)
    .maybeSingle();

  let referralClaim: unknown = null;
  if (referralRow?.id) {
    referralClaim = await grantReferralRewards({
      referrerUserId: referralRow.referrer_id as string,
      referredUserId: user.id,
      referralId: referralRow.id as string,
      operationId: `onboarding_grant:${referralRow.id}`,
    });
  }

  return {
    ok: true,
    alreadyCompleted: persisted.alreadyCompleted,
    referralClaim,
  };
}
