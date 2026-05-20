/**
 * DreamOS86 — Centralized Auth Service
 *
 * Single source of truth for every auth operation.
 * OAuth redirect URLs use live browser origin in the client.
 */

import { createClient } from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/app-url";
import {
  getCallbackUrl as buildCallbackUrl,
  getPasswordResetUrl as buildPasswordResetUrl,
} from "@/lib/auth/oauth-redirect";

export { getAppUrl } from "@/lib/app-url";
export { getCallbackUrl, getPasswordResetUrl, getOAuthBaseUrl } from "@/lib/auth/oauth-redirect";

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
      emailRedirectTo: buildCallbackUrl(),
    },
  });
}

export async function authSignInWithOAuth(provider: "google" | "github", next?: string) {
  const client = createClient();
  const redirectTo = buildCallbackUrl(next);

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
    redirectTo: buildPasswordResetUrl(),
  });
}

export async function authUpdatePassword(password: string) {
  return createClient().auth.updateUser({ password });
}

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
        return `${name} sign-in failed (unsupported provider). Check Supabase Auth URL config includes ${buildCallbackUrl()} and matches this origin.`;
      }
      return replacement;
    }
  }
  return message.replace(/^\[.*?\]\s*/, "").replace(/\s+/g, " ").trim();
}

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
