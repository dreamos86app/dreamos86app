/**
 * DreamOS86 — Next.js Middleware
 *
 * Refreshes Supabase auth tokens on every request so server components
 * always receive a fresh session.
 *
 * Also protects authenticated routes — unauthenticated users are redirected
 * to /auth/login.
 */

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { buildAuthCallbackRedirectFromSearchParams } from "@/lib/auth/oauth-redirect";
import { safeAuthReturnPath } from "@/lib/auth/oauth-prep";
import {
  clearReferralCookieOnResponse,
  DREAMOS_REF_COOKIE,
  sanitizeReferralCode,
} from "@/lib/auth/ref-cookie";
import { REFERRAL_NOTICE_QUERY } from "@/lib/referrals/referral-messages";
import { classifyUrlHostname } from "@/lib/network/safe-fetch";
import { applyAuthCookieOptions } from "@/lib/auth/auth-cookie-options";

const PROXY_AUTH_WARN_MS = 30_000;
const PROXY_AUTH_TIMEOUT_MS = 2_500;
let lastProxyAuthWarnAt = 0;

async function resolveProxyUser(supabase: {
  auth: { getUser: () => Promise<{ data: { user: User | null } }> };
}): Promise<{ user: User | null; timedOut: boolean }> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("proxy_auth_timeout")), PROXY_AUTH_TIMEOUT_MS),
      ),
    ]);
    return { user: result.data.user, timedOut: false };
  } catch (e) {
    if (e instanceof Error && e.message === "proxy_auth_timeout") {
      return { user: null, timedOut: true };
    }
    throw e;
  }
}

function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth"));
}

function logProxyAuthFailure(err: unknown, supabaseHost: string): void {
  const now = Date.now();
  if (now - lastProxyAuthWarnAt < PROXY_AUTH_WARN_MS) return;
  lastProxyAuthWarnAt = now;
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code: string }).code === "string"
      ? (err as { code: string }).code
      : null;
  console.warn("[dreamos-proxy] Supabase auth refresh failed:", {
    errorCode: code,
    message: msg.slice(0, 200),
    supabaseHost,
    hostBucket: classifyUrlHostname(supabaseHost),
    hint: "Edge middleware cannot use Node TLS workarounds — use *.supabase.co locally.",
  });
}

/** Routes that require authentication */
const PROTECTED_PATHS = [
  "/projects",
  "/templates",
  "/chat",
  "/credits",
  "/deploy",
  "/marketplace",
  "/analytics",
  "/media",
  "/community",
  "/explore",
  "/settings",
  "/help",
  "/changelog",
  "/onboarding",
  "/admin",
  "/referrals",
  "/billing",
  "/generate",
  "/create",
  "/dashboard",
  "/apps",
];

/** Routes that should redirect authenticated users to home */
const AUTH_PATHS = ["/auth/login", "/auth/signup", "/auth/sign-up", "/auth/waitlist"];

function extractReferralCode(request: NextRequest): string | null {
  const fromQuery = sanitizeReferralCode(request.nextUrl.searchParams.get("ref"));
  if (fromQuery) return fromQuery;
  const m = request.nextUrl.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (m) return sanitizeReferralCode(m[1]);
  return null;
}

function attachReferralCookieIfPresent(request: NextRequest, response: NextResponse): void {
  const code = extractReferralCode(request);
  if (!code) return;
  response.cookies.set(
    DREAMOS_REF_COOKIE,
    encodeURIComponent(code),
    applyAuthCookieOptions({}, request, 3600),
  );
}

function redirectLoggedInReferralAttempt(request: NextRequest): NextResponse {
  const url = new URL("/", request.url);
  url.searchParams.set(REFERRAL_NOTICE_QUERY, "existing_user");
  const response = NextResponse.redirect(url);
  clearReferralCookieOnResponse(response);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // OAuth mis-config: Supabase sometimes lands PKCE code on Site URL (/) instead of /auth/callback
  const oauthRedirect = buildAuthCallbackRedirectFromSearchParams(
    searchParams,
    request.url,
  );
  if (oauthRedirect && (pathname === "/" || pathname === "")) {
    return NextResponse.redirect(new URL(oauthRedirect, request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user = null as Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"];

  let authRefreshFailed = false;
  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    } catch {
      return "unknown";
    }
  })();

  const hasSessionCookie = hasSupabaseSessionCookie(request);
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSessionCookie && isAuthPage) {
    user = null;
  } else if (!hasSessionCookie && !PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    user = null;
  } else {
    try {
      const resolved = await resolveProxyUser(supabase);
      user = resolved.user;
      if (resolved.timedOut) {
        authRefreshFailed = true;
        logProxyAuthFailure(new Error("proxy_auth_timeout"), supabaseHost);
      }
    } catch (e) {
      authRefreshFailed = true;
      logProxyAuthFailure(e, supabaseHost);
      user = null;
    }
  }

  if (authRefreshFailed && process.env.NODE_ENV !== "production") {
    return supabaseResponse;
  }

  const referralCode = extractReferralCode(request);
  if (user && referralCode) {
    return redirectLoggedInReferralAttempt(request);
  }

  if (user && AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    const next = searchParams.get("next");
    const dest =
      next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/auth")
        ? next
        : "/create";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (!user && PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const loginUrl = new URL("/auth/login", request.url);
    const nextPath = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("next", safeAuthReturnPath(nextPath) ?? pathname);
    const redirect = NextResponse.redirect(loginUrl);
    attachReferralCookieIfPresent(request, redirect);
    return redirect;
  }

  if (!user) {
    attachReferralCookieIfPresent(request, supabaseResponse);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon-|apple-touch|maskable|brand/|dreamos86-platform-logo.png|logo.png|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
