export const REFERRAL_NOTICE_QUERY = "referral_notice";

export type ReferralNoticeKind =
  | "existing_user"
  | "self_referral"
  | "invalid_code"
  | "saved";

export const REFERRAL_TOAST_MESSAGES: Record<ReferralNoticeKind, string> = {
  existing_user:
    "Referral links only work for new sign-ups. Sign in with your existing account instead.",
  self_referral: "You can't use your own referral link. Share it with a friend to earn Build Credits.",
  invalid_code:
    "This referral link is invalid or expired, but you can still create an account.",
  saved: "Referral saved. Create your account to continue.",
};

export function isReferralNoticeKind(value: string | null): value is ReferralNoticeKind {
  return (
    value === "existing_user" ||
    value === "self_referral" ||
    value === "invalid_code" ||
    value === "saved"
  );
}
