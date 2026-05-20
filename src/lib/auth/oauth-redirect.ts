import { getAppUrl } from "@/lib/app-url";

/**
 * OAuth redirect base — browser uses live origin so localhost / port always match
 * Supabase allowlist entries. Server uses NEXT_PUBLIC_APP_URL.
 */
export function getOAuthBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return getAppUrl();
}

export function getCallbackUrl(next?: string): string {
  const base = `${getOAuthBaseUrl()}/auth/callback`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

export function getPasswordResetUrl(): string {
  return `${getOAuthBaseUrl()}/auth/callback?type=recovery`;
}

/** If Supabase lands OAuth on `/?code=...`, forward to the real callback handler. */
export function buildAuthCallbackRedirectFromSearchParams(
  searchParams: URLSearchParams,
  requestUrl: string,
): string | null {
  if (!searchParams.has("code")) return null;
  const callback = new URL("/auth/callback", requestUrl);
  searchParams.forEach((value, key) => {
    callback.searchParams.set(key, value);
  });
  return callback.pathname + callback.search;
}
