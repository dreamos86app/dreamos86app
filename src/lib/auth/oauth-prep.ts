import {
  DREAMOS_REF_COOKIE,
  DREAMOS_REF_STORAGE_KEY,
  clearPendingReferralForBrowser,
  persistReferralCodeForBrowser,
  readRefCodeFromCookieHeader,
  sanitizeReferralCode,
} from "@/lib/auth/ref-cookie";
import {
  assertCanonicalOAuthRedirectTo,
  getCanonicalOAuthRedirectTo,
  parseRedirectToFromAuthorizeUrl,
} from "@/lib/auth/oauth-redirect";
import { logAuthEvent } from "@/lib/auth/auth-diagnostics";
import {
  formatAuthCookieDirective,
  getAuthCookieOptions,
} from "@/lib/auth/auth-cookie-options";
import { isLocalhostOrigin } from "@/lib/url/app-origin";

export const DREAMOS_AUTH_RETURN_TO_STORAGE = "dreamos_auth_return_to";
export const DREAMOS_RETURN_TO_COOKIE = "dreamos_auth_return_to";

const OAUTH_PREP_KEYS = new Set(["ref", "referral", "referral_code"]);

export function safeAuthReturnPath(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://") || /^javascript:/i.test(trimmed)) return null;

  try {
    const u = new URL(trimmed, "http://oauth-return.invalid");
    if (u.hostname !== "oauth-return.invalid") return null;
    if (u.pathname.startsWith("/auth")) return null;

    for (const key of [...u.searchParams.keys()]) {
      if (OAUTH_PREP_KEYS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }

    const qs = u.searchParams.toString();
    const path = `${u.pathname}${qs ? `?${qs}` : ""}`;
    return path.length > 512 ? null : path;
  } catch {
    return null;
  }
}

export function readAuthReturnToFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p.startsWith(`${DREAMOS_RETURN_TO_COOKIE}=`)) continue;
    try {
      const v = decodeURIComponent(p.slice(DREAMOS_RETURN_TO_COOKIE.length + 1));
      return safeAuthReturnPath(v);
    } catch {
      return null;
    }
  }
  return null;
}

export function persistAuthReturnToForBrowser(path: string): void {
  if (typeof document === "undefined") return;
  const safe = safeAuthReturnPath(path);
  if (!safe) return;

  try {
    window.sessionStorage.setItem(DREAMOS_AUTH_RETURN_TO_STORAGE, safe);
  } catch {
    /* ignore */
  }

  const flags = formatAuthCookieDirective(getAuthCookieOptions());
  document.cookie = `${DREAMOS_RETURN_TO_COOKIE}=${encodeURIComponent(safe)}; ${flags}`;
}

export function captureReferralFromLocationSearch(search: string): string | null {
  if (!search) return null;
  try {
    const ref = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("ref");
    const code = sanitizeReferralCode(ref);
    if (!code) return null;
    persistReferralCodeForBrowser(code);
    return code;
  } catch {
    return null;
  }
}

export type OAuthSignInPrepared = {
  redirectTo: string;
  returnTo: string | null;
  referralCode: string | null;
  blocked?: boolean;
};

export type PrepareOAuthSignInOptions = {
  returnTo?: string | null;
  isAuthenticated?: boolean;
};

/**
 * Client-only: persist referral + return path; return canonical OAuth redirectTo (no query).
 * When already signed in, clears pending referral and blocks OAuth start.
 */
export function prepareClientOAuthSignIn(
  options: PrepareOAuthSignInOptions = {},
  provider: "google" | "github" | "unknown" = "unknown",
): OAuthSignInPrepared {
  const redirectTo = getCanonicalOAuthRedirectTo();
  assertCanonicalOAuthRedirectTo(redirectTo);

  if (typeof window === "undefined") {
    return { redirectTo, returnTo: null, referralCode: null };
  }

  const isAuthenticated = options.isAuthenticated === true;
  const currentPath = `${window.location.pathname}${window.location.search}`;

  if (isAuthenticated) {
    clearPendingReferralForBrowser();
    logOAuthStartDiagnostics(provider, {
      redirectTo,
      oauthStartOrigin: window.location.origin,
      returnTo: null,
      referralCodeDetected: null,
      currentPath,
      isAuthenticated: true,
      blocked: true,
    });
    return { redirectTo, returnTo: null, referralCode: null, blocked: true };
  }

  let referralCode: string | null = captureReferralFromLocationSearch(window.location.search);
  if (!referralCode) {
    try {
      referralCode = sanitizeReferralCode(
        window.localStorage.getItem(DREAMOS_REF_STORAGE_KEY),
      );
    } catch {
      /* ignore */
    }
  }
  if (!referralCode) {
    referralCode = readRefCodeFromCookieHeader(document.cookie);
  }

  let safeReturn = safeAuthReturnPath(options.returnTo ?? null);
  if (!safeReturn) {
    try {
      safeReturn = safeAuthReturnPath(
        window.sessionStorage.getItem(DREAMOS_AUTH_RETURN_TO_STORAGE),
      );
    } catch {
      /* ignore */
    }
  }
  if (!safeReturn) {
    safeReturn = safeAuthReturnPath(
      new URLSearchParams(window.location.search).get("next"),
    );
  }
  if (safeReturn) {
    persistAuthReturnToForBrowser(safeReturn);
  }

  logOAuthStartDiagnostics(provider, {
    redirectTo,
    oauthStartOrigin: window.location.origin,
    returnTo: safeReturn,
    referralCodeDetected: referralCode,
    currentPath,
    isAuthenticated: false,
    blocked: false,
  });

  return { redirectTo, returnTo: safeReturn, referralCode };
}

export function logOAuthStartDiagnostics(
  provider: "google" | "github" | "unknown",
  meta: {
    redirectTo: string;
    oauthStartOrigin: string;
    returnTo: string | null;
    referralCodeDetected: string | null;
    currentPath: string;
    isAuthenticated: boolean;
    blocked?: boolean;
  },
): void {
  if (process.env.NODE_ENV === "production") return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  let supabaseProjectRef: string | null = null;
  try {
    supabaseProjectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : null;
  } catch {
    supabaseProjectRef = null;
  }

  const cookieOpts = getAuthCookieOptions(meta.oauthStartOrigin);

  logAuthEvent("oauth_started", {
    provider,
    oauth_start_redirect_to: meta.redirectTo,
    oauth_start_origin: meta.oauthStartOrigin,
    auth_return_to: meta.returnTo,
    referral_code_detected: meta.referralCodeDetected,
    current_path: meta.currentPath,
    is_authenticated: meta.isAuthenticated,
    oauth_blocked: meta.blocked ?? false,
    supabase_project_ref: supabaseProjectRef,
    expected_google_redirect_uri: supabaseProjectRef
      ? `https://${supabaseProjectRef}.supabase.co/auth/v1/callback`
      : null,
    cookie_names_set: meta.blocked
      ? []
      : [
          ...(meta.referralCodeDetected ? [DREAMOS_REF_COOKIE] : []),
          ...(meta.returnTo ? [DREAMOS_RETURN_TO_COOKIE] : []),
        ],
    cookie_options: {
      domain: cookieOpts.domain ?? null,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      path: cookieOpts.path,
    },
  });
}

export function logSupabaseAuthorizeUrl(
  provider: "google" | "github",
  authorizeUrl: string,
  expectedRedirectTo: string,
): void {
  if (process.env.NODE_ENV === "production") return;

  const parsed = parseRedirectToFromAuthorizeUrl(authorizeUrl);
  const polluted =
    !parsed ||
    parsed !== expectedRedirectTo ||
    parsed.includes("?") ||
    /\bref=|\bnext=|returnTo=/i.test(parsed);

  logAuthEvent(
    polluted ? "auth_redirect_mismatch" : "oauth_started",
    {
      provider,
      supabase_authorize_redirect_to: parsed,
      expected_redirect_to: expectedRedirectTo,
      authorize_url_host: (() => {
        try {
          return new URL(authorizeUrl).host;
        } catch {
          return null;
        }
      })(),
    },
    polluted ? "warn" : "info",
  );
}

export function isSafeReturnPathForOrigin(
  path: string,
  currentOrigin: string,
): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  if (lower.includes("://")) return false;
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
    return isLocalhostOrigin(currentOrigin);
  }
  return true;
}

export function resolvePostAuthDestination(
  nextFromQuery: string | null,
  cookieHeader: string | null,
  currentOrigin?: string,
): string {
  const origin =
    currentOrigin ??
    (typeof window !== "undefined" ? window.location.origin : "https://dreamos86.com");

  const fromQuery = safeAuthReturnPath(nextFromQuery);
  if (fromQuery && isSafeReturnPathForOrigin(fromQuery, origin)) return fromQuery;

  const fromCookie = readAuthReturnToFromCookieHeader(cookieHeader);
  if (fromCookie && isSafeReturnPathForOrigin(fromCookie, origin)) return fromCookie;

  return "/";
}

export const OAUTH_EPHEMERAL_COOKIES = [DREAMOS_REF_COOKIE, DREAMOS_RETURN_TO_COOKIE] as const;
