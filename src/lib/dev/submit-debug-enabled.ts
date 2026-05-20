"use client";

import { isDreamosOwnerEmail } from "@/lib/admin-owner";

/**
 * Submit pipeline, build bundles, Ready bars, and auth debug.
 * Hidden by default everywhere (including local dev).
 *
 * To bring placeholders back temporarily:
 * - Add `?debug=submit` to the URL, or
 * - Set `NEXT_PUBLIC_SUBMIT_DEBUG=true` in `.env.local` and restart dev server.
 */
export function isSubmitDebugEnabled(
  searchParams?: URLSearchParams | null,
  ownerEmail?: string | null,
): boolean {
  if (process.env.NEXT_PUBLIC_SUBMIT_DEBUG === "true") return true;

  const params =
    searchParams ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null);

  if (params?.get("debug") === "submit") return true;

  if (
    ownerEmail &&
    isDreamosOwnerEmail(ownerEmail) &&
    params?.get("debug") === "submit"
  ) {
    return true;
  }

  return false;
}
