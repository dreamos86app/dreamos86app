import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadReferralDashboard } from "@/lib/referrals/referral-dashboard";
import { resolveRequestOrigin } from "@/lib/url/app-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referrals — referral dashboard (fresh from DB via service role).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const origin = resolveRequestOrigin(request);
  const dashboard = await loadReferralDashboard(user.id, origin);

  return NextResponse.json(
    {
      code: dashboard.referralCode,
      inviteUrl: dashboard.referralLink,
      referralCode: dashboard.referralCode,
      referralLink: dashboard.referralLink,
      slotsUsed: dashboard.friendsInvited,
      slotsRemaining: dashboard.slotsRemaining,
      maxReferrals: dashboard.maxReferrals,
      creditsPerReferral: dashboard.perReferralBuildCredits,
      perReferralBuildCredits: dashboard.perReferralBuildCredits,
      maxReached: dashboard.maxReached,
      stats: {
        total: dashboard.friendsInvited,
        rewarded: dashboard.rewarded,
        creditsEarned: dashboard.creditsEarned,
      },
      friendsInvited: dashboard.friendsInvited,
      rewarded: dashboard.rewarded,
      creditsEarned: dashboard.creditsEarned,
      referrals: dashboard.activity.map((row) => ({
        id: row.id,
        name: row.displayName ?? row.email?.split("@")[0] ?? "User",
        email: row.email,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        joined: row.createdAt,
        status: row.status,
        creditsGranted: row.rewardCredits,
        rewardCredits: row.rewardCredits,
        rewardedAt: row.rewardedAt,
      })),
      referredBy: dashboard.referredBy?.referralCode ?? null,
      referredByProfile: dashboard.referredBy,
      activity: dashboard.activity,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
