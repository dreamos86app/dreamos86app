import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  bootstrapProfileFromOAuth,
  readRefCookieFromRequest,
} from "@/lib/auth/profile-bootstrap";
import { DREAMOS_REF_COOKIE } from "@/lib/auth/ref-cookie";

/**
 * Supabase PKCE auth callback — handles ALL auth redirect cases.
 *
 * After successful sign-in, bootstraps profile via service role (RLS-safe)
 * and routes first-time users to /onboarding.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "recovery" for password-reset links
  const nextRaw = searchParams.get("next") ?? "/";

  const providerError = searchParams.get("error");
  const providerErrorDesc = searchParams.get("error_description");

  if (providerError) {
    const slug = providerError === "access_denied" ? "access_denied" : "server_error";
    const params = new URLSearchParams({ error: slug });
    if (providerErrorDesc) params.set("error_description", providerErrorDesc);
    return NextResponse.redirect(`${origin}/auth/login?${params}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const msg = exchangeError.message.toLowerCase();
    const isExpired =
      msg.includes("expired") ||
      msg.includes("otp_expired") ||
      msg.includes("already") ||
      msg.includes("token has been used");
    const slug = isExpired ? "session_exchange_failed" : "callback_failed";
    return NextResponse.redirect(`${origin}/auth/login?error=${slug}`);
  }

  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  const refCookie = readRefCookieFromRequest(request);

  let onboardingCompleted = true;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const result = await bootstrapProfileFromOAuth(user, refCookie);
      onboardingCompleted = result.onboardingCompleted;
    }
  } catch (bootstrapErr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[auth/callback] profile bootstrap:",
        bootstrapErr instanceof Error ? bootstrapErr.message : bootstrapErr,
      );
    }
  }

  const safeNext = nextRaw.startsWith("/") ? nextRaw : "/";
  const destination = onboardingCompleted ? safeNext : `/onboarding?next=${encodeURIComponent(safeNext)}`;

  const response = NextResponse.redirect(`${origin}${destination}`);
  if (refCookie) {
    response.cookies.set(DREAMOS_REF_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
  }
  return response;
}
