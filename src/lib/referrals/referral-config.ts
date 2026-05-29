/** Credits granted to referrer and referred user per successful referral. */
export const REFERRAL_CREDITS_PER_USER = 5;

/** Max invites per referrer. */
export const MAX_REFERRALS_PER_USER = 5;

import { isLocalhostOrigin, resolveSiteOrigin } from "@/lib/url/app-origin";

/** Canonical share origin for invite links in production. */
export const REFERRAL_SHARE_ORIGIN = "https://dreamos86.com";

export function buildReferralInviteUrl(code: string, requestOrigin?: string): string {
  let origin = REFERRAL_SHARE_ORIGIN;
  if (typeof window !== "undefined") {
    origin = isLocalhostOrigin(window.location.origin)
      ? window.location.origin
      : REFERRAL_SHARE_ORIGIN;
  } else if (requestOrigin) {
    const resolved = resolveSiteOrigin(requestOrigin);
    origin = isLocalhostOrigin(resolved) ? resolved : REFERRAL_SHARE_ORIGIN;
  }
  return `${origin.replace(/\/$/, "")}/auth/sign-up?ref=${encodeURIComponent(code)}`;
}
