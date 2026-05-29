import {
  resolveAppOrigin,
  isLocalhostOrigin,
  resolveRequestOrigin,
} from "@/lib/url/app-origin";

/** Params allowed when forwarding OAuth landings to /auth/callback. */
export const OAUTH_CALLBACK_ALLOW_PARAMS = new Set([
  "code",
  "type",
  "error",
  "error_description",
  "state",
]);

/** Params that must never reach /auth/callback. */
const OAUTH_CALLBACK_DENY_PARAMS = new Set([
  "ref",
  "referral",
  "referral_code",
  "next",
  "returnTo",
  "return_to",
  "redirect",
  "callback",
  "url",
]);

/**
 * Canonical OAuth callback host — localhost keeps live port; production uses dreamos86.com.
 */
export function resolveCanonicalOAuthOrigin(
  requestOrigin?: string | Request,
): string {
  let origin: string;

  if (typeof window !== "undefined") {
    origin = window.location.origin.replace(/\/$/, "");
  } else if (requestOrigin instanceof Request) {
    origin = resolveRequestOrigin(requestOrigin);
  } else if (requestOrigin) {
    try {
      origin = new URL(requestOrigin).origin.replace(/\/$/, "");
      if (process.env.NODE_ENV === "production" && isLocalhostOrigin(origin)) {
        origin = "https://dreamos86.com";
      }
    } catch {
      origin = resolveAppOrigin(requestOrigin);
    }
  } else {
    origin = resolveAppOrigin();
  }

  try {
    const host = new URL(origin).hostname;
    if (host === "dreamos86.com" || host === "www.dreamos86.com") {
      return "https://dreamos86.com";
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return origin;
    }
  } catch {
    /* fall through */
  }

  if (isLocalhostOrigin(origin)) return origin;

  if (process.env.NODE_ENV === "production") {
    const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (app) {
      try {
        const host = new URL(app).hostname;
        if (host === "dreamos86.com" || host === "www.dreamos86.com") {
          return "https://dreamos86.com";
        }
      } catch {
        /* ignore */
      }
    }
    return "https://dreamos86.com";
  }

  return origin;
}

/**
 * OAuth redirectTo — exactly `${origin}/auth/callback` with no query, hash, or referral data.
 */
export function getCanonicalOAuthRedirectTo(requestOrigin?: string): string {
  const origin = resolveCanonicalOAuthOrigin(requestOrigin);
  const redirectTo = `${origin}/auth/callback`;
  assertCanonicalOAuthRedirectTo(redirectTo);
  return redirectTo;
}

/** @alias */
export function getCanonicalOAuthCallbackUrl(requestOrigin?: string): string {
  return getCanonicalOAuthRedirectTo(requestOrigin);
}

export function assertCanonicalOAuthRedirectTo(redirectTo: string): void {
  if (!redirectTo.endsWith("/auth/callback")) {
    throw new Error(`[oauth] redirectTo must end with /auth/callback: ${redirectTo}`);
  }
  if (redirectTo.includes("?") || redirectTo.includes("#")) {
    throw new Error(`[oauth] redirectTo must not include query or hash: ${redirectTo}`);
  }
  if (/\bref=|\bnext=|returnTo=|return_to=/i.test(redirectTo)) {
    throw new Error(`[oauth] redirectTo is polluted: ${redirectTo}`);
  }
}

/**
 * @deprecated For OAuth use getCanonicalOAuthRedirectTo(). Email-only flows may pass safe relative next.
 */
export function getOAuthBaseUrl(requestUrl?: string): string {
  return resolveCanonicalOAuthOrigin(requestUrl);
}

/**
 * @deprecated For OAuth use getCanonicalOAuthRedirectTo().
 */
export function getCallbackUrl(next?: string, requestUrl?: string): string {
  const base = getCanonicalOAuthRedirectTo(requestUrl);
  if (!next?.trim()) return base;
  const safe = next.trim();
  if (!safe.startsWith("/") || safe.startsWith("//") || safe.includes("://")) {
    return base;
  }
  return `${base}?next=${encodeURIComponent(safe)}`;
}

export function getPasswordResetUrl(requestUrl?: string): string {
  return `${resolveCanonicalOAuthOrigin(requestUrl)}/auth/callback?type=recovery`;
}

/** If Supabase lands OAuth on `/?code=...`, forward only auth-required params to /auth/callback. */
export function buildAuthCallbackRedirectFromSearchParams(
  searchParams: URLSearchParams,
  requestUrl: string,
): string | null {
  if (!searchParams.has("code") && !searchParams.has("error")) return null;

  const callback = new URL("/auth/callback", requestUrl);
  searchParams.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (OAUTH_CALLBACK_DENY_PARAMS.has(lower)) return;
    if (!OAUTH_CALLBACK_ALLOW_PARAMS.has(lower)) return;
    callback.searchParams.set(key, value);
  });

  if (!callback.searchParams.has("code") && !callback.searchParams.has("error")) {
    return null;
  }

  return callback.pathname + callback.search;
}

/** Parse redirect_to from Supabase authorize URL (dev diagnostics). */
export function parseRedirectToFromAuthorizeUrl(authorizeUrl: string): string | null {
  try {
    return new URL(authorizeUrl).searchParams.get("redirect_to");
  } catch {
    return null;
  }
}
