/** Short-lived referral capture cookie (server + client share name only). */
export const DREAMOS_REF_COOKIE = "dreamos_ref_code";
export const DREAMOS_REF_STORAGE_KEY = "dreamos-ref-code";

export function readRefCodeFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p.startsWith(`${DREAMOS_REF_COOKIE}=`)) continue;
    try {
      const v = decodeURIComponent(p.slice(DREAMOS_REF_COOKIE.length + 1));
      const code = v.trim().toUpperCase();
      if (code.length >= 4 && code.length <= 16) return code;
    } catch {
      return null;
    }
  }
  return null;
}

/** Client: persist ref for OAuth round-trip + legacy localStorage. */
export function persistReferralCodeForBrowser(code: string): void {
  const c = code.trim().toUpperCase();
  if (c.length < 4 || c.length > 16) return;
  try {
    window.localStorage.setItem(DREAMOS_REF_STORAGE_KEY, c);
  } catch {
    /* ignore */
  }
  const secure = window.location.protocol === "https:";
  document.cookie = `${DREAMOS_REF_COOKIE}=${encodeURIComponent(c)}; Path=/; Max-Age=3600; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function readReferralCodeFromBrowserCookie(): string | null {
  if (typeof document === "undefined") return null;
  return readRefCodeFromCookieHeader(document.cookie);
}
