"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  isReferralNoticeKind,
  REFERRAL_NOTICE_QUERY,
  REFERRAL_TOAST_MESSAGES,
  type ReferralNoticeKind,
} from "@/lib/referrals/referral-messages";
import {
  isReferralTopBannerKind,
  ReferralNoticeBanner,
} from "@/components/referrals/referral-notice-banner";

/** Top banner (existing account) or toast for other referral notices; strips query param on dismiss. */
export function ReferralNoticeHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bannerKind, setBannerKind] = React.useState<ReferralNoticeKind | null>(null);
  const handledRef = React.useRef<string | null>(null);

  const stripNoticeFromUrl = React.useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(REFERRAL_NOTICE_QUERY);
      const qs = url.searchParams.toString();
      router.replace(qs ? `${url.pathname}?${qs}` : url.pathname);
    } catch {
      /* ignore */
    }
  }, [router]);

  const dismissBanner = React.useCallback(() => {
    setBannerKind(null);
    stripNoticeFromUrl();
  }, [stripNoticeFromUrl]);

  React.useEffect(() => {
    const kind = searchParams.get(REFERRAL_NOTICE_QUERY);
    if (!isReferralNoticeKind(kind)) return;

    const key = `${kind}:${searchParams.toString()}`;
    if (handledRef.current === key) return;
    handledRef.current = key;

    if (isReferralTopBannerKind(kind)) {
      setBannerKind(kind);
      return;
    }

    const message = REFERRAL_TOAST_MESSAGES[kind];
    if (kind === "invalid_code") toast.warning(message);
    else toast.info(message);
    stripNoticeFromUrl();
  }, [searchParams, stripNoticeFromUrl]);

  return (
    <AnimatePresence>
      {bannerKind ? (
        <ReferralNoticeBanner key={bannerKind} kind={bannerKind} onDismiss={dismissBanner} />
      ) : null}
    </AnimatePresence>
  );
}
