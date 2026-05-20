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
import { buildAuthCallbackRedirectFromSearchParams } from "@/lib/auth/oauth-redirect";

/** Routes that require authentication */
const PROTECTED_PATHS = [
  "/projects",
  "/templates",
  "/chat",
  "/credits",
  "/pricing",
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

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    authRefreshFailed = true;
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[dreamos-proxy] Supabase auth refresh failed (Edge may not use dev TLS workaround):",
        e instanceof Error ? e.message : e,
      );
    }
    user = null;
  }

  // In local dev, Edge middleware cannot use NODE_TLS_REJECT_UNAUTHORIZED from instrumentation.
  // Do not force logged-out redirects when refresh failed — server routes use Node + TLS workaround.
  if (authRefreshFailed && process.env.NODE_ENV !== "production") {
    return supabaseResponse;
  }

  if (user && AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!user && PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|dreamos86-platform-logo.png|logo.png|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
