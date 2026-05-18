"use client";

import * as React from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { DREAMOS_REF_STORAGE_KEY, persistReferralCodeForBrowser } from "@/lib/auth/ref-cookie";

/**
 * Mounted globally. Persists ?ref= to cookie + localStorage so OAuth/email callback can attribute.
 * After sign-in, POST /api/referrals/attribute once when localStorage still holds a code.
 */
export function ReferralCapture() {
  const { profile } = useAuthStore();

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (!code?.trim()) return;
      persistReferralCodeForBrowser(code);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (!profile?.id) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(DREAMOS_REF_STORAGE_KEY);
    } catch {
      return;
    }
    if (!stored) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/referrals/attribute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: stored }),
        });
        if (cancelled) return;
        if (
          res.ok ||
          res.status === 400 ||
          res.status === 404 ||
          res.status === 409
        ) {
          try {
            window.localStorage.removeItem(DREAMOS_REF_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* network — retry on next load */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return null;
}
