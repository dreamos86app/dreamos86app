"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, RefreshCw } from "lucide-react";
import { variants } from "@/lib/motion";
import { useAuthStore } from "@/lib/stores/auth-store";
import { CreditsTracker } from "@/components/credits/credits-tracker";
import { refreshCredits, useCreditsStore } from "@/lib/stores/credits-store";
import { Button } from "@/components/ui/button";
import { PLAN_DISPLAY } from "@/lib/billing/plans";
import { BillingSubscriptionPanel } from "@/components/billing/billing-subscription-panel";

type BillingState = {
  planId: string;
  plan: { name: string; priceMonthlyUsd: number | null; description: string };
  tokensRemaining: number;
  monthlyTokens: number;
  resetAt: string | null;
  subscription: {
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    pendingDowngradePlan: string | null;
    planInterval?: string;
  } | null;
  paddle?: {
    configured: boolean;
    userMessage: string;
    missing: string[];
    primary: string;
  };
  monthlyActionCredits?: number;
  billingProviderPrimary?: string;
};

export function BillingSettings() {
  const { profile } = useAuthStore();
  const {
    build,
    action,
    planId: creditsPlanId,
    loading: creditsLoading,
    error: creditsError,
    isConfirmed,
  } = useCreditsStore();
  const [billing, setBilling] = React.useState<BillingState | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadBilling = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/billing/subscription");
    const json = (await res.json()) as BillingState & { error?: string };
    if (res.ok) setBilling(json);
    else setBilling(null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const searchParams = useSearchParams();
  const paddleReturn = searchParams.get("paddle");
  const [activationMessage, setActivationMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (paddleReturn !== "success") return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const res = await fetch("/api/billing/status", { credentials: "include" });
      const json = (await res.json()) as {
        message?: string;
        active?: boolean;
        webhookPending?: boolean;
        entitlementApplied?: boolean;
      };
      if (cancelled) return;
      setActivationMessage(json.message ?? "Activating your plan…");
      await refreshCredits({ force: true, reason: "plan-change" });
      if (json.active || json.entitlementApplied) {
        void loadBilling();
        return;
      }
      if (attempts >= 36) return;
      window.setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [paddleReturn, loadBilling]);

  React.useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      if (paddleReturn === "success") return;
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        void loadBilling();
        void refreshCredits({ reason: "manual" });
      }, 800);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadBilling, paddleReturn]);

  const planId = billing?.planId ?? profile?.plan_id ?? "free";
  const planInfo = PLAN_DISPLAY[planId as keyof typeof PLAN_DISPLAY] ?? PLAN_DISPLAY.free;
  const paddleReady = billing?.paddle?.configured ?? false;
  const monthlyAction = billing?.monthlyActionCredits ?? action.planAllowance;

  return (
    <motion.div
      variants={variants.staggerContainer}
      initial="hidden"
      animate="show"
      className="dashboard-shell space-y-6 overflow-x-hidden"
    >
      {paddleReturn === "success" && activationMessage ? (
        <motion.div
          variants={variants.fadeUp}
          className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px]"
        >
          <p className="font-medium text-foreground">Payment received — activating your plan</p>
          <p className="mt-1 text-muted-foreground">{activationMessage}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Credits update only after Paddle webhook confirmation.
          </p>
        </motion.div>
      ) : null}

      {!paddleReady && !loading && (
        <motion.div
          variants={variants.fadeUp}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px]"
        >
          <p className="font-medium text-foreground">Paddle checkout — setup required</p>
          <p className="mt-1 text-muted-foreground">
            {billing?.paddle?.userMessage ??
              "DreamOS86 subscriptions use Paddle. Checkout is not live until credentials are configured."}
          </p>
        </motion.div>
      )}

      <motion.div variants={variants.fadeUp}>
        <div className="rounded-[var(--radius-xl)] bg-background ring-1 ring-border overflow-hidden">
          <div className="p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-[20px] font-bold tracking-tight">Billing</h2>
                    <p className="text-[13px] text-muted-foreground">
                      {planInfo.name} · manage subscription and credits
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px]"
                    onClick={() => {
                      void loadBilling();
                      void refreshCredits({ force: true, reason: "manual" });
                    }}
                  >
                    <RefreshCw className="mr-1 size-3" />
                    Refresh billing status
                  </Button>
                </div>

                <CreditsTracker
                  isConfirmed={isConfirmed}
                  build={build}
                  action={action}
                  planId={creditsPlanId}
                  loading={creditsLoading || !isConfirmed}
                  error={creditsError}
                  variant="compact"
                  showUpgrade={false}
                  onRetry={() => void refreshCredits({ reason: "manual", force: true })}
                />
              </>
            )}
          </div>

          {!loading ? (
            <div className="border-t border-border bg-surface/50 px-6 py-5">
              <BillingSubscriptionPanel
                planId={planId}
                paddleReady={paddleReady}
                subscription={billing?.subscription ?? null}
                monthlyActionCredits={monthlyAction}
                onRefresh={() => {
                  void loadBilling();
                  void refreshCredits({ force: true, reason: "plan-change" });
                }}
              />
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
