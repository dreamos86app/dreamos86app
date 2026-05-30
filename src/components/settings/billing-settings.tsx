"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CreditCard,
  ArrowRight,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { CreditsTracker } from "@/components/credits/credits-tracker";
import { refreshCredits, useCreditsStore } from "@/lib/stores/credits-store";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PlanUpgradeModal } from "@/components/billing/plan-upgrade-modal";
import { PLAN_DISPLAY } from "@/lib/billing/plans";
import { BILLABLE_PLAN_IDS, billablePlanDefinition, type BillablePlanId } from "@/lib/billing/billable-plans";
import {
  UPGRADE_POLICY_COPY,
  isHighestPaidPlan,
} from "@/lib/billing/upgrade-policy";
import { resolveBillablePlanAction, resolvePlanAction } from "@/lib/billing/plan-action-resolver";

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
  } | null;
  stripe: { configured: boolean; missingEnv: string[] };
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
  const { build, action, planId: creditsPlanId, loading: creditsLoading, error: creditsError, isConfirmed } = useCreditsStore();
  const [billing, setBilling] = React.useState<BillingState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [upgradePlan, setUpgradePlan] = React.useState<BillablePlanId | null>(null);
  const [downgradePlan, setDowngradePlan] = React.useState<BillablePlanId | "free" | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [acting, setActing] = React.useState(false);

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
      };
      if (cancelled) return;
      setActivationMessage(json.message ?? "Activating your plan…");
      if (json.active || attempts > 40) return;
      window.setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [paddleReturn]);

  async function scheduleDowngrade(plan: BillablePlanId | "free") {
    if (downgradePlan !== plan) {
      setDowngradePlan(plan);
      return;
    }
    setActing(true);
    const downgradeUrl = "/api/billing/paddle/downgrade";
    const res = await fetch(downgradeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan, confirmed: true }),
    });
    const json = (await res.json()) as { message?: string; error?: string };
    setActing(false);
    if (!res.ok) {
      toast.error(json.error ?? "Could not schedule downgrade");
      return;
    }
    toast.success(json.message ?? "Downgrade scheduled");
    setDowngradePlan(null);
    void loadBilling();
  }

  async function cancelRenewal() {
    if (!showCancelConfirm) {
      setShowCancelConfirm(true);
      return;
    }
    setActing(true);
    const cancelUrl = "/api/billing/paddle/cancel";
    const res = await fetch(cancelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    const json = (await res.json()) as { message?: string; error?: string };
    setActing(false);
    if (!res.ok) {
      toast.error(json.error ?? "Cancel failed");
      return;
    }
    toast.success(json.message ?? "Renewal canceled");
    setShowCancelConfirm(false);
    void loadBilling();
  }

  const planId = billing?.planId ?? profile?.plan_id ?? "free";
  const planInfo = PLAN_DISPLAY[planId as keyof typeof PLAN_DISPLAY] ?? PLAN_DISPLAY.free;
  const isPaid = planId !== "free";
  const paddleReady = billing?.paddle?.configured ?? false;
  const monthlyAction = billing?.monthlyActionCredits ?? action.planAllowance;
  const atHighestPlan = isHighestPaidPlan(planId);
  const planChangeTargets: Array<{ id: BillablePlanId | "free"; label: string }> = [
    { id: "free", label: "Free" },
    ...BILLABLE_PLAN_IDS.map((id) => ({ id, label: billablePlanDefinition(id).label })),
  ];

  const daysUntilReset = (billing?.resetAt ?? build.resetDate)
    ? Math.max(0, Math.ceil((new Date(billing?.resetAt ?? build.resetDate!).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <motion.div variants={variants.staggerContainer} initial="hidden" animate="show" className="dashboard-shell space-y-6 overflow-x-hidden">
      {paddleReturn === "success" && activationMessage ? (
        <motion.div
          variants={variants.fadeUp}
          className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px]"
        >
          <p className="font-medium text-foreground">Payment received — activating your plan</p>
          <p className="mt-1 text-muted-foreground">{activationMessage}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Credits update only after Paddle webhook confirmation (never from the browser).
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
          {(billing?.paddle?.missing ?? []).length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Missing: {(billing?.paddle?.missing ?? []).join(", ")}
            </p>
          )}
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                      Current plan
                    </p>
                    <h2 className="text-[24px] font-bold tracking-tight">{planInfo.name}</h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {planInfo.priceMonthlyUsd != null ? `$${planInfo.priceMonthlyUsd} / month` : "Custom pricing"} ·{" "}
                      {monthlyAction.toLocaleString()} Action Credits / mo
                    </p>
                    {billing?.subscription?.cancelAtPeriodEnd && billing.subscription.currentPeriodEnd && (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-600">
                        <AlertTriangle className="size-3.5" />
                        Cancels on {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                    {billing?.subscription?.pendingDowngradePlan && (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        Downgrade to {billing.subscription.pendingDowngradePlan} starts next billing cycle.
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1",
                      isPaid ? "text-accent bg-accent/10 ring-accent/20" : "text-muted-foreground bg-muted/60 ring-border",
                    )}
                  >
                    {billing?.subscription?.status ?? (isPaid ? "active" : "free")}
                  </span>
                </div>

                <div className="mt-5">
                  <CreditsTracker
                    isConfirmed={isConfirmed}
                    build={build}
                    action={action}
                    planId={creditsPlanId}
                    loading={creditsLoading || !isConfirmed}
                    error={creditsError}
                    variant="compact"
                    showUpgrade={!atHighestPlan}
                    onRetry={() => void refreshCredits({ reason: "manual", force: true })}
                  />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
                    <div className="flex items-center gap-2 mb-1">
                      <RefreshCw className="size-3.5 text-muted-foreground" />
                      <p className="text-[11px] font-medium uppercase text-muted-foreground">Renews in</p>
                    </div>
                    <p className="text-[22px] font-bold">{daysUntilReset != null ? `${daysUntilReset}d` : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="size-3.5 text-muted-foreground" />
                      <p className="text-[11px] font-medium uppercase text-muted-foreground">Billing</p>
                    </div>
                    <p className="text-[22px] font-bold">{paddleReady ? "Paddle" : "Not configured"}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-border bg-surface/50 px-6 py-4 space-y-4">
            <p className="text-[13px] font-medium text-foreground">Change plan</p>
            <p className="text-[12px] text-muted-foreground">{UPGRADE_POLICY_COPY.upgradeSummary}</p>
            {atHighestPlan ? (
              <p className="text-[12px] text-muted-foreground">You are on the highest plan (Infinity VII).</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {planChangeTargets.map((target) => {
                const action =
                  target.id === "free"
                    ? resolvePlanAction(planId, "free")
                    : resolveBillablePlanAction(planId, target.id);
                if (action.kind === "current") {
                  return (
                    <Button key={target.id} variant="outline" size="sm" disabled>
                      {action.label}
                    </Button>
                  );
                }
                if (action.kind === "upgrade" || action.kind === "get") {
                  return (
                    <Button
                      key={target.id}
                      variant="outline"
                      size="sm"
                      disabled={!paddleReady || acting || target.id === "free"}
                      onClick={() => target.id !== "free" && setUpgradePlan(target.id as BillablePlanId)}
                    >
                      {action.label}
                    </Button>
                  );
                }
                if (action.kind === "downgrade") {
                  const downId = target.id as BillablePlanId | "free";
                  return (
                    <Button
                      key={target.id}
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => void scheduleDowngrade(downId)}
                    >
                      {downgradePlan === downId ? `Confirm ${action.label}` : action.label}
                    </Button>
                  );
                }
                return null;
              })}
            </div>
            {isPaid && (
              <>
                <p className="text-[13px] font-medium pt-2">Cancel subscription</p>
                <p className="text-[12px] text-muted-foreground">
                  {UPGRADE_POLICY_COPY.downgradeSummary} Cancel stops renewal but paid access continues until{" "}
                  {billing?.subscription?.currentPeriodEnd
                    ? new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()
                    : "period end"}
                  .
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={acting}
                  onClick={() => void cancelRenewal()}
                >
                  {showCancelConfirm ? "Confirm cancel renewal" : "Cancel renewal"}
                </Button>
              </>
            )}

            {isPaid && paddleReady && (
              <Button variant="secondary" size="sm" disabled={acting} asChild>
                <a href="https://my.paddle.com/" target="_blank" rel="noopener noreferrer">
                  <CreditCard className="mr-1.5 size-3.5" />
                  Manage subscription in Paddle
                  <ArrowRight className="ml-1 size-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </motion.div>
      {upgradePlan && (
        <PlanUpgradeModal
          open
          targetPlanId={upgradePlan}
          onClose={() => setUpgradePlan(null)}
          onSuccess={() => {
            toast.success("Upgrade submitted — credits refresh after payment confirms.");
            void loadBilling();
            void refreshCredits({ reason: "manual", force: true });
          }}
        />
      )}
    </motion.div>
  );
}
