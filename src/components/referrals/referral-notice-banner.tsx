"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REFERRAL_TOAST_MESSAGES,
  type ReferralNoticeKind,
} from "@/lib/referrals/referral-messages";

const AUTO_DISMISS_MS = 5500;

const BANNER_KINDS = new Set<ReferralNoticeKind>(["existing_user", "self_referral"]);

export function isReferralTopBannerKind(kind: ReferralNoticeKind): boolean {
  return BANNER_KINDS.has(kind);
}

export function ReferralNoticeBanner({
  kind,
  onDismiss,
}: {
  kind: ReferralNoticeKind;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [kind, onDismiss]);

  if (!mounted || !isReferralTopBannerKind(kind)) return null;

  const message = REFERRAL_TOAST_MESSAGES[kind];

  return createPortal(
    <motion.div
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "pointer-events-auto fixed left-1/2 top-4 z-[10050] w-[min(100%-2rem,520px)] -translate-x-1/2",
          "flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3",
          "shadow-lg ring-1 ring-red-500/20 backdrop-blur-md",
        )}
        data-testid="referral-existing-account-banner"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">Already have an account</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-foreground"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
    </motion.div>,
    document.body,
  );
}
