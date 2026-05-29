"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { hasActiveSession } from "@/lib/auth/client-identity";
import { clearPendingReferralForBrowser, sanitizeReferralCode } from "@/lib/auth/ref-cookie";
import {
  REFERRAL_NOTICE_QUERY,
  type ReferralNoticeKind,
} from "@/lib/referrals/referral-messages";

function referralCodeFromPath(pathname: string, searchParams: URLSearchParams): string | null {
  const fromQuery = sanitizeReferralCode(searchParams.get("ref"));
  if (fromQuery) return fromQuery;
  const m = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (m) return sanitizeReferralCode(m[1]);
  return null;
}

/**
 * Logged-in users cannot use referral links — clear storage and redirect home with notice.
 */
export function ReferralGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, session, profile, loading } = useAuthStore();

  React.useEffect(() => {
    if (loading) return;
    if (!hasActiveSession(session, user)) return;

    const code = referralCodeFromPath(pathname ?? "", searchParams);
    if (!code) return;

    clearPendingReferralForBrowser();

    let notice: ReferralNoticeKind = "existing_user";
    if (profile?.referral_code?.trim().toUpperCase() === code) {
      notice = "self_referral";
    }

    const onAuthSignup =
      pathname?.startsWith("/auth/signup") ||
      pathname?.startsWith("/auth/sign-up") ||
      pathname === "/signup";

    const showNoticeOnCurrentPage = () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("ref");
        url.searchParams.set(REFERRAL_NOTICE_QUERY, notice);
        const qs = url.searchParams.toString();
        const dest = qs ? `${url.pathname}?${qs}` : url.pathname;
        if (pathname?.match(/^\/r\//)) {
          router.replace(`/?${REFERRAL_NOTICE_QUERY}=${notice}`);
          return;
        }
        router.replace(dest);
      } catch {
        router.replace(`/?${REFERRAL_NOTICE_QUERY}=${notice}`);
      }
    };

    if (
      onAuthSignup ||
      searchParams.has("ref") ||
      pathname?.match(/^\/r\//)
    ) {
      showNoticeOnCurrentPage();
    }
  }, [loading, session, user, profile?.referral_code, pathname, searchParams, router]);

  return null;
}
