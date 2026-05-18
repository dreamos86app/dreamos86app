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

/** Routes that require authentication */
const PROTECTED_PATHS = [
  "/",
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
];

/** Routes that should redirect authenticated users to home */
const AUTH_PATHS = ["/auth/login", "/auth/signup", "/auth/sign-up", "/auth/waitlist"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Only run Supabase middleware when env vars are present
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

  // Refresh session — do NOT remove this
  let user = null as Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"];

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    // Local Windows dev often hits TLS chain issues hitting supabase.co; without
    // NODE_TLS_REJECT_UNAUTHORIZED uncaught failures here yield 500 for every route.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dreamos-proxy] Supabase auth refresh failed:", e);
    }
    user = null;
  }

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from auth pages
  if (user && AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users to login for protected routes
  if (!user && PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
