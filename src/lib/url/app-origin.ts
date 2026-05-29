/**
 * DreamOS86 — safe app/site origin resolution.
 *
 * Development must never force production URLs for navigation or auth callbacks.
 * Production uses NEXT_PUBLIC_APP_URL / VERCEL_URL when set.
 */

const LOCALHOST_DEFAULT = "http://localhost:3000";

let originBootLogged = false;

function trimOrigin(url: string): string {
  return url.replace(/\/$/, "");
}

export function isLocalhostOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function vercelPreviewOrigin(): string | null {
  const vercel = process.env.VERCEL_URL?.trim();
  if (!vercel) return null;
  const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}`;
}

const PRODUCTION_CANONICAL_ORIGIN = "https://dreamos86.com";

function productionFallbackOrigin(): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app && !isLocalhostOrigin(app)) return trimOrigin(app);
  const vercel = vercelPreviewOrigin();
  if (vercel) return vercel;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  if (process.env.NODE_ENV === "production") return PRODUCTION_CANONICAL_ORIGIN;
  return LOCALHOST_DEFAULT;
}

/**
 * Resolve origin from an incoming Request (proxy-aware).
 * Production must never fall back to localhost when the request is on dreamos86.com.
 */
export function resolveRequestOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const host =
      forwardedHost?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      url.host;
    const proto =
      forwardedProto?.split(",")[0]?.trim() || url.protocol.replace(":", "") || "https";
    if (host) {
      const origin = trimOrigin(`${proto}://${host}`);
      if (process.env.NODE_ENV === "production" && isLocalhostOrigin(origin)) {
        return PRODUCTION_CANONICAL_ORIGIN;
      }
      return origin;
    }
  } catch {
    /* fall through */
  }
  return resolveAppOrigin(request.url);
}

export type OriginMode = "client-live" | "dev-local" | "env-app" | "vercel" | "production-env" | "fallback";

/**
 * Runtime origin for OAuth callbacks, API absolute URLs, and server-side redirects.
 * Client always uses the live tab origin.
 */
export function resolveAppOrigin(requestUrl?: string): string {
  if (typeof window !== "undefined") {
    return trimOrigin(window.location.origin);
  }

  if (requestUrl) {
    try {
      return trimOrigin(new URL(requestUrl).origin);
    } catch {
      /* fall through */
    }
  }

  const nodeEnv = process.env.NODE_ENV;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (nodeEnv !== "production") {
    if (appUrl && isLocalhostOrigin(appUrl)) {
      return trimOrigin(appUrl);
    }
    return LOCALHOST_DEFAULT;
  }

  if (appUrl && !isLocalhostOrigin(appUrl)) return trimOrigin(appUrl);

  const vercel = vercelPreviewOrigin();
  if (vercel) return vercel;

  return productionFallbackOrigin();
}

export function getOriginMode(requestUrl?: string): OriginMode {
  if (typeof window !== "undefined") return "client-live";
  if (process.env.NODE_ENV !== "production") {
    const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (app && isLocalhostOrigin(app)) return "env-app";
    return "dev-local";
  }
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return "production-env";
  if (process.env.VERCEL_URL?.trim()) return "vercel";
  if (requestUrl) return "client-live";
  return "fallback";
}

/**
 * Canonical public site URL (OG, referrals, share links).
 * On localhost in the browser, always use the live origin — not production marketing env.
 */
export function resolveSiteOrigin(requestUrl?: string): string {
  if (typeof window !== "undefined") {
    const origin = trimOrigin(window.location.origin);
    if (isLocalhostOrigin(origin)) return origin;
    return origin;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    if (process.env.NODE_ENV !== "production" && !isLocalhostOrigin(site)) {
      return LOCALHOST_DEFAULT;
    }
    return trimOrigin(site);
  }

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) {
    if (process.env.NODE_ENV !== "production" && !isLocalhostOrigin(app)) {
      return LOCALHOST_DEFAULT;
    }
    if (!isLocalhostOrigin(app) || process.env.NODE_ENV === "production") {
      return trimOrigin(app);
    }
  }

  return resolveAppOrigin(requestUrl);
}

/** metadataBase for root layout — never point dev at production. */
export function resolveMetadataBaseOrigin(requestUrl?: string): string {
  if (process.env.NODE_ENV !== "production") {
    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (
      (site && !isLocalhostOrigin(site)) ||
      (app && !isLocalhostOrigin(app))
    ) {
      return LOCALHOST_DEFAULT;
    }
  }
  return resolveSiteOrigin(requestUrl);
}

function envUrlHost(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/** Log once on server boot in development (no secrets). */
export function logAppOriginBoot(): void {
  if (originBootLogged) return;
  originBootLogged = true;
  if (process.env.NODE_ENV === "production") return;

  const mode = getOriginMode();
  const resolved = resolveAppOrigin();
  console.info("[DreamOS86][url] resolved origin:", {
    NODE_ENV: process.env.NODE_ENV ?? "(unset)",
    mode,
    resolvedOrigin: resolved,
    NEXT_PUBLIC_APP_URL_host: envUrlHost("NEXT_PUBLIC_APP_URL"),
    NEXT_PUBLIC_SITE_URL_host: envUrlHost("NEXT_PUBLIC_SITE_URL"),
  });
}
