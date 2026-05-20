/**
 * Columns the app reads/writes for onboarding — derived from code audit (not guessed).
 * Used by schema health checks and complete_user_onboarding RPC alignment.
 */

/** Fields written by POST /api/onboarding (route + complete_user_onboarding). */
export const ONBOARDING_API_WRITE_FIELDS = [
  "user_id",
  "completed_at",
  "onboarding_completed_at",
  "completed",
  "onboarding_completed",
  "current_step",
  "step",
  "onboarding_step",
  "workspace_name",
  "experience_level",
  "preferred_model",
  "default_model_id",
  "referral_source",
  "heard_about_us",
  "use_case",
  "build_goal",
  "promo_code",
  "answers",
  "data",
  "updated_at",
] as const;

/** Minimum columns required for the current 4-step wizard API. */
export const ONBOARDING_REQUIRED_COLUMNS = [
  "user_id",
  "completed_at",
  "workspace_name",
  "experience_level",
  "preferred_model",
  "referral_source",
  "use_case",
  "answers",
  "created_at",
] as const;

/** Profile columns touched when onboarding completes (never credits/plan/stripe). */
export const PROFILE_ONBOARDING_WRITE_FIELDS = [
  "onboarding_completed",
  "onboarding_completed_at",
  "onboarding_step",
  "onboarding_answers",
  "use_case",
  "signup_wizard_completed",
  "experience_level",
  "preferred_model",
  "default_model_id",
] as const;

export const PROFILE_ONBOARDING_OPTIONAL_FIELDS = [
  "referral_code",
  "referred_by",
  "referral_applied_at",
  "workspace_name",
  "full_name",
  "display_name",
  "email",
] as const;

export const REFERRAL_TABLES = ["referral_codes", "referrals", "referral_rewards"] as const;

export const LEDGER_TABLES = ["token_ledger", "credit_events"] as const;

export const ONBOARDING_MIGRATION_FILE =
  "supabase/migrations/20260527120000_complete_onboarding_schema.sql";

export const ONBOARDING_SQL_FALLBACK = "scripts/complete-onboarding-schema.sql";
