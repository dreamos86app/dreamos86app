import type { User } from "@supabase/supabase-js";
import { readRefCodeFromCookieHeader } from "@/lib/auth/ref-cookie";
import { createSupabaseAdmin, type SupabaseAdminClient } from "@/lib/supabase/admin";
import { attachReferralByCode } from "@/lib/referrals/server-referral";
import { isMissingProfileColumnError } from "@/lib/supabase/schema-errors";

const FREE_TOKENS = 100;

export function readRefCookieFromRequest(request: Request): string | null {
  return readRefCodeFromCookieHeader(request.headers.get("cookie"));
}

function toDisplayName(user: User, rawName: string): string {
  const emailPrefix = (user.email ?? "").split("@")[0] ?? "";
  if (!rawName.trim()) {
    return emailPrefix.replace(/[^a-zA-Z0-9\s]/g, "").trim() || "User";
  }
  return rawName
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function oauthRawName(user: User): string {
  const meta = user.user_metadata ?? {};
  return (
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.preferred_username === "string" && meta.preferred_username) ||
    ""
  );
}

function usernameBaseFromUser(user: User): string {
  const emailPrefix = (user.email ?? "").split("@")[0] ?? "user";
  const fromName = oauthRawName(user);
  const base = (fromName || emailPrefix).toLowerCase().replace(/[^a-z0-9]/g, "");
  return base.slice(0, 24) || "user";
}

async function allocateUsername(admin: SupabaseAdminClient, base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "user";
  let candidate = clean;
  for (let i = 0; i < 40; i++) {
    const { data } = await admin.from("profiles").select("id").eq("username", candidate).maybeSingle();
    if (!data) return candidate;
    const suffix = `${Math.floor(1000 + Math.random() * 8999)}`;
    candidate = `${clean}${suffix}`.slice(0, 32);
  }
  return `${clean}${Date.now()}`.slice(0, 32);
}

export interface BootstrapProfileResult {
  onboardingCompleted: boolean;
}

/**
 * Creates or patches profile rows using the service role (bypasses RLS safely).
 * Does not grant referral credits — that happens in claim_referral_reward after onboarding.
 */
export async function bootstrapProfileFromOAuth(
  user: User,
  refCodeFromCookie: string | null,
): Promise<BootstrapProfileResult> {
  const admin = createSupabaseAdmin();

  const meta = user.user_metadata ?? {};
  const rawName = oauthRawName(user);
  const emailPrefix = (user.email ?? "").split("@")[0] ?? "";
  const displayName = toDisplayName(user, rawName) || toDisplayName(user, emailPrefix);
  const avatarFromOAuth =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;

  const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const baseUser = usernameBaseFromUser(user);

  const { data: existing } = await admin
    .from("profiles")
    .select(
      "id, full_name, username, avatar_url, credits_remaining, plan_id, onboarding_completed, referred_by, email",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const username = await allocateUsername(admin, baseUser);
    const email = user.email ?? "";

    const insertRow: Record<string, unknown> = {
      id: user.id,
      email,
      full_name: displayName,
      display_name: displayName,
      username,
      avatar_url: avatarFromOAuth,
      plan_id: "free",
      plan_interval: "monthly",
      credits_remaining: FREE_TOKENS,
      credits_reset_at: resetAt,
      onboarding_completed: false,
      onboarding_completed_at: null,
      default_model_id: "claude-3-5-sonnet",
      use_case: null,
      experience_level: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      email_verified: Boolean(user.email_confirmed_at ?? user.confirmed_at),
      terms_accepted_at: null,
      terms_version: null,
      terms_accepted_ip: null,
      is_admin: false,
      suspended_at: null,
      suspended_reason: null,
      referral_code: null,
      total_referrals: 0,
      referred_by: null,
      workspace_name: null,
      workspace_icon_url: null,
      workspace_description: null,
      onboarding_answers: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error: insertErr } = await (admin.from("profiles") as any).insert(insertRow);

    if (insertErr && isMissingProfileColumnError(insertErr.message)) {
      const { onboarding_answers: _a, ...withoutAnswers } = insertRow;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error: insertErr } = await (admin.from("profiles") as any).insert(withoutAnswers));
    }

    if (insertErr) {
      throw new Error(insertErr.message);
    }

    if (refCodeFromCookie) {
      await attachReferralByCode(user.id, refCodeFromCookie);
    }

    return { onboardingCompleted: false };
  }

  const updates: Record<string, unknown> = {};

  if (!(existing.full_name ?? "").trim() && displayName) {
    updates.full_name = displayName;
    updates.display_name = displayName;
  }
  if (!(existing.username ?? "").trim()) {
    updates.username = await allocateUsername(admin, baseUser);
  }
  if (!(existing.avatar_url ?? "").trim() && avatarFromOAuth) {
    updates.avatar_url = avatarFromOAuth;
  }
  // Never overwrite token balance, plan, or subscription fields on existing profiles.
  if (!existing.plan_id) {
    updates.plan_id = "free";
  }
  const authEmail = user.email?.trim() ?? "";
  if (authEmail && (existing.email ?? "").trim().toLowerCase() !== authEmail.toLowerCase()) {
    updates.email = authEmail;
  }

  if (Object.keys(updates).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("profiles") as any).update(updates).eq("id", user.id);
  }

  if (refCodeFromCookie && !(existing.referred_by ?? "").trim()) {
    await attachReferralByCode(user.id, refCodeFromCookie);
  }

  return { onboardingCompleted: existing.onboarding_completed === true };
}
