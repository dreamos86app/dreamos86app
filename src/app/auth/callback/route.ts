import { type NextRequest, NextResponse } from "next/server";
import { resolveRequestOrigin } from "@/lib/url/app-origin";
import {
  bootstrapProfileFromOAuth,
  readRefCookieFromRequest,
} from "@/lib/auth/profile-bootstrap";
import {
  OAUTH_EPHEMERAL_COOKIES,
  resolvePostAuthDestination,
} from "@/lib/auth/oauth-prep";
import { callbackErrorSlugFromExchangeMessage } from "@/lib/auth";
import { logAuthEvent } from "@/lib/auth/auth-diagnostics";
import { applyAuthCookieOptions } from "@/lib/auth/auth-cookie-options";
import { diagnoseOAuthCallbackCookies } from "@/lib/auth/oauth-cookie-diagnostics";
import {
  applyPendingAuthCookies,
  createRouteHandlerClient,
  type PendingAuthCookie,
} from "@/lib/supabase/route-handler";

/**
 * Supabase PKCE auth callback — handles ALL auth redirect cases.
 * Session cookies from exchangeCodeForSession must be applied to the final redirect Response.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const origin = resolveRequestOrigin(request);

  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const providerError = searchParams.get("error");
  const providerErrorDesc = searchParams.get("error_description");

  const cookieDiag = diagnoseOAuthCallbackCookies(request.cookies.getAll());

  if (process.env.NODE_ENV !== "production") {
    console.info("[DreamOS86][oauth-callback]", {
      origin,
      hasCode: Boolean(code),
      hasPkceVerifierCookie: cookieDiag.hasPkceVerifier,
      hasReferralCookie: cookieDiag.hasReferralCookie,
      hasReturnToCookie: cookieDiag.hasReturnToCookie,
      cookieNames: cookieDiag.allCookieNames,
    });
  }

  logAuthEvent(
    "oauth_callback_received",
    {
      hasCode: Boolean(code),
      type: type ?? null,
      providerError: providerError ?? null,
      has_pkce_verifier_cookie: cookieDiag.hasPkceVerifier,
      has_referral_cookie: cookieDiag.hasReferralCookie,
      has_return_to_cookie: cookieDiag.hasReturnToCookie,
      cookie_names: cookieDiag.allCookieNames,
    },
    "info",
    "server",
  );

  if (providerError) {
    logAuthEvent("oauth_callback_failed", { providerError }, "warn", "server");
    const slug = providerError === "access_denied" ? "access_denied" : "server_error";
    const params = new URLSearchParams({ error: slug });
    const safeDesc = providerErrorDesc
      ?.replace(/[^\w\s.,!?@\-–—'"]/g, " ")
      .trim()
      .slice(0, 200);
    if (safeDesc && !/token|secret|code/i.test(safeDesc)) {
      params.set("error_description", safeDesc);
    }
    return NextResponse.redirect(`${origin}/auth/login?${params}`);
  }

  if (!code) {
    logAuthEvent("oauth_callback_failed", { reason: "missing_code" }, "warn", "server");
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  const pendingSessionCookies: PendingAuthCookie[] = [];
  const exchangeJar = NextResponse.next({ request });
  const supabase = createRouteHandlerClient(request, exchangeJar, pendingSessionCookies);
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const slug = callbackErrorSlugFromExchangeMessage(exchangeError.message);
    const missingRequired =
      slug === "auth_cookie_missing" && !cookieDiag.hasPkceVerifier
        ? "pkce_code_verifier"
        : null;

    logAuthEvent(
      slug === "auth_cookie_missing" ? "auth_cookie_missing" : "oauth_callback_failed",
      {
        slug,
        reason: exchangeError.message.slice(0, 160),
        missing_required_cookie: missingRequired,
        has_referral_cookie: cookieDiag.hasReferralCookie,
        has_return_to_cookie: cookieDiag.hasReturnToCookie,
        cookie_names: cookieDiag.allCookieNames,
        supabase_auth_cookie_names: cookieDiag.supabaseAuthCookieNames,
      },
      "error",
      "server",
    );

    const params = new URLSearchParams({ error: slug });
    const safe = exchangeError.message
      .replace(/[^\w\s.,!?@\-–—'"]/g, " ")
      .trim()
      .slice(0, 180);
    if (safe && !/token|secret|password/i.test(safe)) {
      params.set("error_description", safe);
    }
    if (process.env.NODE_ENV !== "production" && missingRequired) {
      params.set("missing_cookie", missingRequired);
    }
    return NextResponse.redirect(`${origin}/auth/login?${params}`);
  }

  logAuthEvent("oauth_session_created", undefined, "info", "server");

  if (type === "recovery") {
    const response = NextResponse.redirect(`${origin}/auth/reset-password`);
    applyPendingAuthCookies(response, pendingSessionCookies);
    return response;
  }

  const refCookie = readRefCookieFromRequest(request);

  let onboardingCompleted = true;
  let profileSetupFailed = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      logAuthEvent("profile_ensure_started", { userId: user.id }, "info", "server");
      const result = await bootstrapProfileFromOAuth(user, refCookie);
      onboardingCompleted = result.onboardingCompleted;
      logAuthEvent(
        "profile_ensure_succeeded",
        { onboardingCompleted },
        "info",
        "server",
      );
    }
  } catch (bootstrapErr) {
    profileSetupFailed = true;
    const msg =
      bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr);
    logAuthEvent("profile_ensure_failed", { reason: msg.slice(0, 160) }, "error", "server");
    if (process.env.NODE_ENV !== "production") {
      console.warn("[auth/callback] profile bootstrap:", msg);
    }
  }

  const safeNext = resolvePostAuthDestination(null, request.headers.get("cookie"), origin);
  let destination = onboardingCompleted
    ? safeNext
    : `/onboarding?next=${encodeURIComponent(safeNext)}`;

  if (profileSetupFailed) {
    const dest = new URL(destination, origin);
    dest.searchParams.set("error", "profile_setup_failed");
    destination = `${dest.pathname}${dest.search}`;
  }

  const response = NextResponse.redirect(`${origin}${destination}`);
  applyPendingAuthCookies(response, pendingSessionCookies);

  for (const name of OAUTH_EPHEMERAL_COOKIES) {
    response.cookies.set(name, "", applyAuthCookieOptions({ maxAge: 0 }, request, 0));
  }

  return response;
}
