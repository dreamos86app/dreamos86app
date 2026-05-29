import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildReferralInviteUrl,
  MAX_REFERRALS_PER_USER,
  REFERRAL_CREDITS_PER_USER,
} from "@/lib/referrals/referral-config";
import {
  countReferrerRewarded,
  resolveReferrerPublicProfile,
} from "@/lib/referrals/apply-referral";
import { resolveReferrerUserId } from "@/lib/referrals/server-referral";
import { randomBytes } from "crypto";

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateStableCode(userId: string): string {
  const hash = Buffer.from(userId.replace(/-/g, ""), "hex");
  const seed = hash.readUInt32BE(0) ^ hash.readUInt32BE(4);
  let result = "";
  let n = seed;
  for (let i = 0; i < 8; i++) {
    result += ALPHA[n % ALPHA.length];
    n = Math.imul(n, 1664525) + 1013904223;
    n = n >>> 0;
  }
  return result;
}

export async function ensureUserReferralCode(userId: string): Promise<string> {
  const admin = createSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.referral_code) {
    const code = (profile.referral_code as string).trim().toUpperCase();
    await admin.from("referral_codes").upsert(
      { user_id: userId, code },
      { onConflict: "user_id" },
    );
    return code;
  }

  const code =
    generateStableCode(userId) +
    randomBytes(2).toString("hex").toUpperCase().slice(0, 4);
  const uniqueCode = code.slice(0, 8);

  await admin.from("profiles").update({ referral_code: uniqueCode }).eq("id", userId);
  await admin.from("referral_codes").upsert(
    { user_id: userId, code: uniqueCode },
    { onConflict: "user_id" },
  );

  return uniqueCode;
}

export type ReferralActivityRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: "pending" | "rewarded" | "capped" | "blocked" | "invalid";
  rewardCredits: number;
  createdAt: string;
  rewardedAt: string | null;
};

export type ReferralDashboardPayload = {
  referralCode: string;
  referralLink: string;
  maxReferrals: number;
  perReferralBuildCredits: number;
  friendsInvited: number;
  rewarded: number;
  creditsEarned: number;
  slotsRemaining: number;
  maxReached: boolean;
  referredBy: {
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    referralCode: string;
    bonusReceived: boolean;
    appliedAt: string | null;
  } | null;
  activity: ReferralActivityRow[];
};

function initialsColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = ["#1e6bff", "#7c3aed", "#10b981", "#f59e0b", "#ec4899"];
  return hues[h % hues.length];
}

export function referralAvatarFallback(email: string | null, id: string): {
  initials: string;
  color: string;
} {
  const seed = email ?? id;
  const local = (email ?? "user").split("@")[0] ?? "U";
  const initials = local.slice(0, 2).toUpperCase();
  return { initials, color: initialsColor(seed) };
}

export async function loadReferralDashboard(
  userId: string,
  requestOrigin?: string,
): Promise<ReferralDashboardPayload> {
  const admin = createSupabaseAdmin();
  const code = await ensureUserReferralCode(userId);

  const { data: myProfile } = await admin
    .from("profiles")
    .select("referred_by")
    .eq("id", userId)
    .maybeSingle();

  const { data: referralRows } = await admin
    .from("referrals")
    .select("id, referred_id, status, created_at, rewarded_at, reward_amount, code")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_REFERRALS_PER_USER + 5);

  const rows = referralRows ?? [];
  const referredIds = rows.map((r) => r.referred_id as string);

  const profilesById = new Map<
    string,
    { email: string | null; full_name: string | null; display_name: string | null; avatar_url: string | null }
  >();

  if (referredIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name, display_name, avatar_url")
      .in("id", referredIds);

    for (const p of profiles ?? []) {
      profilesById.set(p.id as string, {
        email: (p.email as string | null) ?? null,
        full_name: (p.full_name as string | null) ?? null,
        display_name: (p.display_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const activity: ReferralActivityRow[] = rows.map((r) => {
    const p = profilesById.get(r.referred_id as string);
    const email = p?.email ?? null;
    const displayName = p?.display_name ?? p?.full_name ?? email?.split("@")[0] ?? "User";
    const status = String(r.status ?? "pending") as ReferralActivityRow["status"];
    const rewardCredits =
      status === "rewarded" ? (r.reward_amount as number | null) ?? REFERRAL_CREDITS_PER_USER : 0;

    return {
      id: r.id as string,
      email,
      displayName,
      avatarUrl: p?.avatar_url ?? null,
      status,
      rewardCredits,
      createdAt: r.created_at as string,
      rewardedAt: (r.rewarded_at as string | null) ?? null,
    };
  });

  const friendsInvited = rows.length;
  const rewarded = rows.filter((r) => r.status === "rewarded").length;
  const creditsEarned = rewarded * REFERRAL_CREDITS_PER_USER;
  const slotsRemaining = Math.max(0, MAX_REFERRALS_PER_USER - rewarded);
  const maxReached = rewarded >= MAX_REFERRALS_PER_USER;

  let referredByPayload: ReferralDashboardPayload["referredBy"] = null;
  const referredByCode = (myProfile?.referred_by as string | null)?.trim() ?? null;
  if (referredByCode) {
    const referrer = await resolveReferrerPublicProfile(referredByCode);
    if (referrer) {
      const { data: myReferral } = await admin
        .from("referrals")
        .select("status, rewarded_at")
        .eq("referred_id", userId)
        .maybeSingle();

      referredByPayload = {
        email: referrer.email,
        displayName: referrer.displayName,
        avatarUrl: referrer.avatarUrl,
        referralCode: referrer.referralCode,
        bonusReceived: (() => {
          const s = myReferral?.status as string | undefined;
          return s === "rewarded" || s === "capped";
        })(),
        appliedAt: (myReferral?.rewarded_at as string | null) ?? null,
      };
    }
  }

  return {
    referralCode: code,
    referralLink: buildReferralInviteUrl(code, requestOrigin),
    maxReferrals: MAX_REFERRALS_PER_USER,
    perReferralBuildCredits: REFERRAL_CREDITS_PER_USER,
    friendsInvited,
    rewarded,
    creditsEarned,
    slotsRemaining,
    maxReached,
    referredBy: referredByPayload,
    activity,
  };
}

export async function userWasReferred(userId: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("referrals")
    .select("id")
    .eq("referred_id", userId)
    .maybeSingle();
  return Boolean(data?.id);
}

export { countReferrerRewarded };
