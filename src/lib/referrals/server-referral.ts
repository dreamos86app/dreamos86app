import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const MAX_REFERRALS_PER_REFERRER = 5;

export async function resolveReferrerUserId(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 4 || normalized.length > 16) return null;

  const admin = createSupabaseAdmin();

  const { data: fromCodes } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("code", normalized)
    .maybeSingle();
  if (fromCodes?.user_id) return fromCodes.user_id;

  const { data: fromProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("referral_code", normalized)
    .maybeSingle();
  return fromProfile?.id ?? null;
}

/**
 * Attach a pending referral (no credit grant). Idempotent when already referred.
 */
export async function attachReferralByCode(
  referredUserId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 4 || normalized.length > 16) {
    return { ok: false, error: "invalid_code" };
  }

  const admin = createSupabaseAdmin();

  const { data: me } = await admin
    .from("profiles")
    .select("id, referred_by, referral_code")
    .eq("id", referredUserId)
    .maybeSingle();

  if (!me) {
    return { ok: false, error: "no_profile" };
  }

  if (me.referred_by?.trim()) {
    return { ok: true };
  }

  if (me.referral_code?.trim() === normalized) {
    return { ok: false, error: "self_referral" };
  }

  const referrerId = await resolveReferrerUserId(normalized);
  if (!referrerId) {
    return { ok: false, error: "code_not_found" };
  }
  if (referrerId === referredUserId) {
    return { ok: false, error: "self_referral" };
  }

  const { count } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referrerId);

  if ((count ?? 0) >= MAX_REFERRALS_PER_REFERRER) {
    return { ok: false, error: "referral_limit_reached" };
  }

  const { data: existingRef } = await admin
    .from("referrals")
    .select("id, code")
    .eq("referred_id", referredUserId)
    .maybeSingle();
  if (existingRef) {
    const syncCode = (existingRef.code as string | undefined)?.trim().toUpperCase() ?? normalized;
    if (syncCode) {
      await admin.from("profiles").update({ referred_by: syncCode }).eq("id", referredUserId);
    }
    return { ok: true };
  }

  const { error: insErr } = await admin.from("referrals").upsert(
    {
      referrer_id: referrerId,
      referred_id: referredUserId,
      code: normalized,
      status: "pending",
    },
    { onConflict: "referred_id", ignoreDuplicates: true },
  );
  if (insErr) {
    if (insErr.code === "23505" || insErr.message.includes("duplicate key")) {
      await admin.from("profiles").update({ referred_by: normalized }).eq("id", referredUserId);
      return { ok: true };
    }
    return { ok: false, error: "insert_failed" };
  }

  await admin.from("profiles").update({ referred_by: normalized }).eq("id", referredUserId);

  return { ok: true };
}
