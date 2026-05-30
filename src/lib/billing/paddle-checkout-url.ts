/**
 * Paddle transaction `checkout.url` — approved domain only in production.
 * Never derive from request origin or window.location in live mode.
 */
import { paddleEnvironment } from "@/lib/billing/paddle-billing";
import { getAppUrl } from "@/lib/app-url";

export const PADDLE_LIVE_CHECKOUT_DOMAIN_ERROR =
  "Live Paddle checkout requires an approved checkout domain. Set PADDLE_CHECKOUT_URL=https://dreamos86.com or use the Paddle default payment link.";

export type PaddleCheckoutUrlMode = "explicit" | "default";

export type PaddleCheckoutUrlResolution =
  | {
      ok: true;
      /** null = omit checkout.url (Paddle default payment link) */
      url: string | null;
      mode: PaddleCheckoutUrlMode;
      /** Human-readable value for admin UI */
      displayLabel: string;
      envConfigured: boolean;
    }
  | { ok: false; error: string };

function normalizeCheckoutBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    return `${u.protocol}//${u.host}`;
  } catch {
    return trimmed;
  }
}

/** Hosts Paddle live checkout must never use. */
export function isDisallowedLiveCheckoutHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (host.endsWith(".vercel.app")) return true;
  if (host.endsWith(".local")) return true;
  return false;
}

export function isDisallowedLiveCheckoutUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return isDisallowedLiveCheckoutHost(u.hostname);
  } catch {
    return true;
  }
}

export function validateProductionCheckoutUrl(url: string): { ok: true } | { ok: false; error: string } {
  if (!url) {
    return { ok: false, error: PADDLE_LIVE_CHECKOUT_DOMAIN_ERROR };
  }
  if (isDisallowedLiveCheckoutUrl(url)) {
    return { ok: false, error: PADDLE_LIVE_CHECKOUT_DOMAIN_ERROR };
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") {
      return {
        ok: false,
        error: "PADDLE_CHECKOUT_URL must use https in production (e.g. https://dreamos86.com).",
      };
    }
  } catch {
    return { ok: false, error: "PADDLE_CHECKOUT_URL is not a valid URL." };
  }
  return { ok: true };
}

/**
 * Resolves the `checkout.url` sent to Paddle when creating a transaction.
 * Production: PADDLE_CHECKOUT_URL or omit (default payment link) — never localhost / preview URLs.
 * Sandbox: PADDLE_CHECKOUT_URL or app origin (localhost allowed).
 */
export function resolvePaddleTransactionCheckoutUrl(): PaddleCheckoutUrlResolution {
  const environment = paddleEnvironment();
  const rawEnv = process.env.PADDLE_CHECKOUT_URL?.trim() ?? "";
  const envConfigured = rawEnv.length > 0;

  if (envConfigured) {
    const url = normalizeCheckoutBaseUrl(rawEnv);
    if (!url) {
      return {
        ok: true,
        url: null,
        mode: "default",
        displayLabel: "Paddle default payment link (empty PADDLE_CHECKOUT_URL)",
        envConfigured: true,
      };
    }
    if (environment === "production") {
      const valid = validateProductionCheckoutUrl(url);
      if (!valid.ok) return { ok: false, error: valid.error };
    }
    return {
      ok: true,
      url,
      mode: "explicit",
      displayLabel: url,
      envConfigured: true,
    };
  }

  if (environment === "production") {
    return {
      ok: true,
      url: null,
      mode: "default",
      displayLabel: "Paddle default payment link (PADDLE_CHECKOUT_URL not set)",
      envConfigured: false,
    };
  }

  const sandboxUrl = normalizeCheckoutBaseUrl(getAppUrl());
  return {
    ok: true,
    url: sandboxUrl,
    mode: "explicit",
    displayLabel: sandboxUrl,
    envConfigured: false,
  };
}

/** True when running local dev against live Paddle credentials. */
export function isLocalDevWithProductionPaddle(): boolean {
  return process.env.NODE_ENV === "development" && paddleEnvironment() === "production";
}

export function localDevProductionPaddleWarning(): string | null {
  if (!isLocalDevWithProductionPaddle()) return null;
  return "Local dev is using PADDLE_ENVIRONMENT=production (live Paddle). Checkout uses PADDLE_CHECKOUT_URL or the Paddle default payment link — not localhost.";
}
