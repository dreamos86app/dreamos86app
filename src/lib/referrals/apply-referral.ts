import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  MAX_REFERRALS_PER_USER,
  REFERRAL_CREDITS_PER_USER,
} from "@/lib/referrals/referral-config";
import { attachReferralByCode, resolveReferrerUserId } from "@/lib/referrals/server-referral";

export type ApplyReferralSource =
  | "oauth_bootstrap"
  | "attribute_api"
  | "onboarding"
  | "manual";

export type ApplyReferralResult =
  | {
      ok: true;
      applied: boolean;
      referralId?: string;
      rewards?: GrantReferralRewardsResult;
      reason?: string;
    }
  | { ok: false; error: string };

export type GrantReferralRewardsResult = {
  success: boolean;
  alreadyRewarded?: boolean;
  referrerRewarded?: boolean;
  referrerCapped?: boolean;
  creditsGranted?: number;
  error?: string;
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Canonical server-side referral attribution + reward grant (idempotent).
 */
export async function applyReferralForNewUser(params: {
  newUserId: string;
  referralCode: string;
  source: ApplyReferralSource;
  operationId?: string;
}): Promise<ApplyReferralResult> {
  const code = normalizeCode(params.referralCode);
  if (code.length < 4 || code.length > 16) {
    return { ok: true, applied: false, reason: "invalid_code" };
  }

  const admin = createSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, referred_by, onboarding_completed, referral_code")
    .eq("id", params.newUserId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "no_profile" };
  }

  if ((profile.referred_by ?? "").trim()) {
    const { data: existing } = await admin
      .from("referrals")
      .select("id, referrer_id, status")
      .eq("referred_id", params.newUserId)
      .maybeSingle();

    if (existing?.id) {
      const rewards = await grantReferralRewards({
        referrerUserId: existing.referrer_id as string,
        referredUserId: params.newUserId,
        referralId: existing.id as string,
        operationId: params.operationId ?? `referral_retry:${existing.id}`,
      });
      return { ok: true, applied: true, referralId: existing.id as string, rewards };
    }
    return { ok: true, applied: false, reason: "already_referred" };
  }

  if (profile.onboarding_completed === true) {
    return { ok: true, applied: false, reason: "existing_user" };
  }

  if (profile.referral_code?.trim().toUpperCase() === code) {
    return { ok: true, applied: false, reason: "self_referral" };
  }

  const attached = await attachReferralByCode(params.newUserId, code);
  if (!attached.ok) {
    if (
      attached.error === "code_not_found" ||
      attached.error === "invalid_code" ||
      attached.error === "self_referral" ||
      attached.error === "referral_limit_reached"
    ) {
      return { ok: true, applied: false, reason: attached.error };
    }
    return { ok: false, error: attached.error };
  }

  const { data: referral } = await admin
    .from("referrals")
    .select("id, referrer_id, status")
    .eq("referred_id", params.newUserId)
    .maybeSingle();

  if (!referral?.id) {
    return { ok: true, applied: false, reason: "no_referral_row" };
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("profiles") as any)
    .update({
      referred_by: code,
      referral_applied_at: now,
    })
    .eq("id", params.newUserId);

  const rewards = await grantReferralRewards({
    referrerUserId: referral.referrer_id as string,
    referredUserId: params.newUserId,
    referralId: referral.id as string,
    operationId: params.operationId ?? `referral_apply:${referral.id}:${params.source}`,
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[referral] applyReferralForNewUser", {
      source: params.source,
      newUserId: params.newUserId,
      referralId: referral.id,
      rewards,
    });
  }

  return { ok: true, applied: true, referralId: referral.id as string, rewards };
}

/**
 * Idempotent Build Credit grants via claim_referral_reward (service role).
 */
export async function grantReferralRewards(params: {
  referrerUserId: string;
  referredUserId: string;
  referralId: string;
  operationId?: string;
}): Promise<GrantReferralRewardsResult> {
  const admin = createSupabaseAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("claim_referral_reward", {
    p_referred_id: params.referredUserId,
    p_credits: REFERRAL_CREDITS_PER_USER,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const row = data as {
    success?: boolean;
    already_rewarded?: boolean;
    referrer_rewarded?: boolean;
    referrer_capped?: boolean;
    credits_granted?: number;
    error?: string;
  } | null;

  if (row?.success === false) {
    return { success: false, error: row.error ?? "claim_failed" };
  }

  return {
    success: true,
    alreadyRewarded: row?.already_rewarded === true,
    referrerRewarded: row?.referrer_rewarded !== false,
    referrerCapped: row?.referrer_capped === true,
    creditsGranted: row?.credits_granted ?? REFERRAL_CREDITS_PER_USER,
  };
}

export async function resolveReferrerPublicProfile(referredByCode: string | null): Promise<{
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  referralCode: string;
} | null> {
  if (!referredByCode?.trim()) return null;
  const code = normalizeCode(referredByCode);
  const referrerId = await resolveReferrerUserId(code);
  if (!referrerId) return null;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("email, full_name, display_name, avatar_url, referral_code")
    .eq("id", referrerId)
    .maybeSingle();

  if (!data) return null;

  return {
    email: data.email ?? null,
    displayName: (data.display_name ?? data.full_name ?? null) as string | null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    referralCode: (data.referral_code as string | null) ?? code,
  };
}

export async function countReferrerRewarded(referrerUserId: string): Promise<number> {
  const admin = createSupabaseAdmin();
  const { data: rows } = await admin
    .from("referrals")
    .select("status")
    .eq("referrer_id", referrerUserId);
  const count = (rows ?? []).filter((r) => {
    const s = r.status as string;
    return s === "rewarded" || s === "capped";
  }).length;
  return count ?? 0;
}

export { MAX_REFERRALS_PER_USER, REFERRAL_CREDITS_PER_USER };
