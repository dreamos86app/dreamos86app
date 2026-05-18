/**
 * DreamOS86 — Centralized Auth Service
 *
 * Single source of truth for every auth operation.
 * Consumed by: auth views, app-provider, reset-password, callback.
 *
 * Centralises:
 *  - URL construction (NEXT_PUBLIC_APP_URL → window.location.origin fallback)
 *  - Supabase auth calls
 *  - Error humanisation
 *  - Callback URL error message registry
 */

import { createClient } from "@/lib/supabase/client";

// ─── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the canonical app base URL.
 * Priority: NEXT_PUBLIC_APP_URL → window.location.origin → VERCEL_PROJECT_PRODUCTION_URL → dreamos86.com
 */
export function getAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://dreamos86.com";
}

/**
 * /auth/callback  — used by OAuth and email confirmation redirects.
 * Optionally embeds a ?next= path so the user lands in the right place.
 */
export function getCallbackUrl(next?: string): string {
  const base = `${getAppUrl()}/auth/callback`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * /auth/callback?type=recovery  — used by password-reset emails.
 * The callback route checks for `type=recovery` and redirects to
 * /auth/reset-password.
 */
export function getPasswordResetUrl(): string {
  return `${getAppUrl()}/auth/callback?type=recovery`;
}

// ─── Auth operations ─────────────────────────────────────────────────────────

export async function authSignIn(email: string, password: string) {
  return createClient().auth.signInWithPassword({ email, password });
}

export async function authSignUp(
  email: string,
  password: string,
  fullName: string,
) {
  return createClient().auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: getCallbackUrl(),
    },
  });
}

export async function authSignInWithOAuth(provider: "google" | "github", next?: string) {
  const client = createClient();
  const redirectTo = getCallbackUrl(next);

  if (provider === "google") {
    return client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
          access_type: "offline",
        },
      },
    });
  }

  return client.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
}

export async function authSignOut() {
  return createClient().auth.signOut();
}

export async function authResetPasswordForEmail(email: string) {
  return createClient().auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetUrl(),
  });
}

export async function authUpdatePassword(password: string) {
  return createClient().auth.updateUser({ password });
}

// ─── Error humanisation ───────────────────────────────────────────────────────

const ERROR_MAP: Array<[RegExp, string]> = [
  [
    /invalid login credentials|invalid_credentials|email or password/i,
    "Incorrect email or password.",
  ],
  [
    /email not confirmed/i,
    "Please verify your email before signing in. Check your inbox.",
  ],
  [
    /user already registered|already been registered|user_already_exists/i,
    "An account with this email exists. Try signing in instead.",
  ],
  [
    /password should be at least|password must be/i,
    "Password must be at least 8 characters.",
  ],
  [/rate.?limit|too many/i, "Too many attempts. Please wait and try again."],
  [
    /network|failed to fetch|load failed/i,
    "Network error. Check your connection and try again.",
  ],
  [
    /token.*expired|link.*expired|expired.*token|otp_expired/i,
    "This link has expired. Please request a new one.",
  ],
  [
    /token.*used|already.*used/i,
    "This link has already been used. Please request a new one.",
  ],
  // Provider-disabled — caller passes provider name for a personalised message
  [
    /provider.*not enabled|not.*enabled.*provider|unsupported provider|provider is not/i,
    "__PROVIDER_OFF__",
  ],
  [/signup.*disabled|signups.*disabled/i, "Account registration is currently disabled."],
  [/email.*invalid|invalid.*email/i, "Please enter a valid email address."],
];

export function humanizeAuthError(
  message: string,
  provider?: "google" | "github",
): string {
  for (const [pattern, replacement] of ERROR_MAP) {
    if (pattern.test(message)) {
      if (replacement === "__PROVIDER_OFF__") {
        const name =
          provider === "google"
            ? "Google"
            : provider === "github"
              ? "GitHub"
              : "OAuth";
        return `${name} sign-in failed (unsupported provider). Likely causes: wrong Supabase project in env, provider not enabled in that project, anon key doesn’t match the project URL, dev server needs a restart after env changes, or the redirect URL isn’t listed under Supabase Auth URL config.`;
      }
      return replacement;
    }
  }
  // Strip raw Supabase technical noise but keep the message readable
  return message.replace(/^\[.*?\]\s*/, "").replace(/\s+/g, " ").trim();
}

// ─── Callback error registry ──────────────────────────────────────────────────

/**
 * Maps ?error= values forwarded by the callback route to user-facing text.
 * The login view reads these via useSearchParams().
 */
export const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  callback_failed: "Authentication failed. Please try again.",
  session_exchange_failed:
    "Your sign-in link has expired. Please request a new one.",
  missing_code: "Invalid authentication link.",
  provider_not_enabled:
    "That sign-in method is not available. Please use email/password.",
  access_denied: "Sign-in was cancelled.",
  server_error:
    "The sign-in provider returned an error. Please try again.",
};
