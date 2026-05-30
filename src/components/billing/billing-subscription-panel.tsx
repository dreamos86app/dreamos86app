"use client";

import * as React from "react";
import { ChevronDown, CreditCard, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  BILLABLE_PLAN_IDS,
  billablePlanDefinition,
  type BillablePlanId,
} from "@/lib/billing/billable-plans";
import {
  billablePlanFromStoragePlanId,
  catalogAmountUsd,
  type CatalogBillingInterval,
} from "@/lib/billing/plan-billing-catalog";
import { monthlyTokensForPlan, normalizePlanId, PLAN_DISPLAY } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/supabase/types";
import { monthlyActionCreditsForPlan } from "@/lib/action-credits/action-credit-allowances";
import {
  isHighestPaidPlan,
  isPlanDowngrade,
  UPGRADE_POLICY_COPY,
} from "@/lib/billing/upgrade-policy";
import { billablePlanToPlanId } from "@/lib/billing/plan-billing-catalog";
import {
  recommendedUpgradeTarget,
  resolvePlanChange,
} from "@/lib/billing/plan-change-router";
import { PlanUpgradeModal } from "@/components/billing/plan-upgrade-modal";
import { BillingDowngradeModal } from "@/components/billing/billing-downgrade-modal";
import Link from "next/link";

type BillingSubscription = {
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  pendingDowngradePlan: string | null;
  planInterval?: string;
};

type Props = {
  planId: string;
  paddleReady: boolean;
  subscription: BillingSubscription | null;
  monthlyActionCredits: number;
  onRefresh: () => void;
};

function storageInterval(sub?: BillingSubscription | null): CatalogBillingInterval | null {
  if (!sub?.planInterval) return null;
  return sub.planInterval === "yearly" ? "annual" : "monthly";
}

export function BillingSubscriptionPanel({
  planId,
  paddleReady,
  subscription,
  monthlyActionCredits,
  onRefresh,
}: Props) {
  const [upgradePlan, setUpgradePlan] = React.useState<BillablePlanId | null>(null);
  const [upgradeInterval, setUpgradeInterval] = React.useState<"monthly" | "yearly">("monthly");
  const [showCompare, setShowCompare] = React.useState(false);
  const [showDowngrade, setShowDowngrade] = React.useState(false);
  const [modalDowngrade, setModalDowngrade] = React.useState<BillablePlanId | "free" | null>(null);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const storagePlanId = normalizePlanId(planId) as PlanId;
  const planInfo = PLAN_DISPLAY[storagePlanId] ?? PLAN_DISPLAY.free;
  const currentInterval = storageInterval(subscription);
  const atHighest = isHighestPaidPlan(planId);
  const recommended = recommendedUpgradeTarget(planId);
  const isPaid = planId !== "free";

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function openCustomerPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/paddle/customer-portal-session", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Could not open subscription portal");
        return;
      }
      window.location.href = json.url;
    } catch {
      toast.error("Could not open subscription portal");
    } finally {
      setPortalLoading(false);
    }
  }

  async function confirmDowngrade(plan: BillablePlanId | "free") {
    setActing(true);
    if (plan === "free") {
      const cancelRes = await fetch("/api/billing/paddle/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const cancelJson = (await cancelRes.json()) as { message?: string; error?: string; portalUrl?: string };
      if (cancelRes.status === 409 && cancelJson.portalUrl) {
        window.location.href = cancelJson.portalUrl;
        setActing(false);
        return;
      }
      if (!cancelRes.ok) {
        toast.error(cancelJson.error ?? "Could not schedule cancellation");
        setActing(false);
        return;
      }
      toast.success(cancelJson.message ?? "Cancellation scheduled for period end");
      setModalDowngrade(null);
      setShowDowngrade(false);
      onRefresh();
      setActing(false);
      return;
    }
    const res = await fetch("/api/billing/paddle/downgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ planId: plan, confirmed: true }),
    });
    const json = (await res.json()) as { message?: string; error?: string };
    setActing(false);
    if (!res.ok) {
      toast.error(json.error ?? "Could not schedule downgrade");
      return;
    }
    toast.success(json.message ?? "Downgrade scheduled for next renewal");
    setModalDowngrade(null);
    setShowDowngrade(false);
    onRefresh();
  }

  function startUpgrade(target: BillablePlanId, interval: CatalogBillingInterval = "monthly") {
    const resolved = resolvePlanChange({
      currentPlanId: planId,
      currentInterval,
      targetPlan: target,
      targetInterval: interval,
    });
    if (resolved.action === "same_plan") {
      toast.info(resolved.description);
      return;
    }
    if (resolved.action === "portal" || resolved.action === "schedule_downgrade") {
      void openCustomerPortal();
      return;
    }
    if (resolved.action === "highest_plan") {
      toast.info(resolved.description);
      return;
    }
    setUpgradeInterval(interval === "annual" ? "yearly" : "monthly");
    setUpgradePlan(target);
  }

  const compareRows: Array<{ id: BillablePlanId | "free"; label: string }> = [
    { id: "free", label: "Free" },
    ...BILLABLE_PLAN_IDS.map((id) => ({ id, label: billablePlanDefinition(id).label })),
  ];

  return (
    <div className="space-y-4">
      {/* A. Current plan */}
      <section className="rounded-xl border border-border bg-background p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Current plan
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[22px] font-bold tracking-tight">{planInfo.name}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {currentInterval === "annual" ? "Annual billing" : "Monthly billing"}
              {renewalDate ? ` · Renews ${renewalDate}` : ""}
            </p>
            <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
              <li>
                {monthlyTokensForPlan(storagePlanId).toLocaleString()} Build Credits / month
              </li>
              <li>{monthlyActionCredits.toLocaleString()} Action Credits / month</li>
            </ul>
            {subscription?.pendingDowngradePlan ? (
              <p className="mt-2 text-[12px] text-amber-600">
                Downgrade to {subscription.pendingDowngradePlan} starts at next renewal.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-border">
              Paddle
            </span>
            {isPaid && paddleReady ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={portalLoading || acting}
                onClick={() => void openCustomerPortal()}
              >
                {portalLoading ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <CreditCard className="mr-1.5 size-3.5" />
                )}
                Manage subscription
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* B. Recommended upgrade */}
      {recommended && !atHighest ? (
        <section className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 text-accent shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
                Recommended
              </p>
              <h3 className="mt-1 text-[18px] font-bold">
                Upgrade to {billablePlanDefinition(recommended).label}
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                +{" "}
                {(
                  monthlyTokensForPlan(billablePlanDefinition(recommended).storagePlanId) -
                  monthlyTokensForPlan(storagePlanId)
                ).toLocaleString()}{" "}
                Build Credits · ${catalogAmountUsd(recommended, "monthly")}/mo
              </p>
              <Button
                type="button"
                className="mt-3"
                size="sm"
                disabled={!paddleReady || acting}
                onClick={() => startUpgrade(recommended)}
              >
                Upgrade to {billablePlanDefinition(recommended).label}
              </Button>
            </div>
          </div>
        </section>
      ) : atHighest ? (
        <section className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-[13px] text-muted-foreground">
          Highest plan — you are on Infinity VII.
        </section>
      ) : null}

      {/* C. Billing cycle */}
      {isPaid && currentInterval === "monthly" ? (
        <section className="rounded-xl border border-border p-4">
          <p className="text-[13px] font-medium">Switch to annual and save 20%</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Same plan, annual billing — managed through Paddle without duplicate subscriptions.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={!paddleReady || acting}
            onClick={() => {
              const billable = billablePlanFromStoragePlanId(planId);
              if (billable) startUpgrade(billable, "annual");
            }}
          >
            Switch to annual
          </Button>
        </section>
      ) : isPaid && currentInterval === "annual" ? (
        <section className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-[13px]">
          <span className="font-medium">Annual billing active</span>
          <span className="text-muted-foreground"> — manage billing in Paddle portal.</span>
        </section>
      ) : null}

      {/* D. Downgrade (collapsed) */}
      {isPaid ? (
        <section className="rounded-xl border border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-medium"
            onClick={() => setShowDowngrade((v) => !v)}
          >
            Need a smaller plan?
            <ChevronDown
              className={cn("size-4 transition-transform", showDowngrade && "rotate-180")}
            />
          </button>
          {showDowngrade ? (
            <div className="border-t border-border px-4 py-3 space-y-2">
              <p className="text-[12px] text-muted-foreground">{UPGRADE_POLICY_COPY.downgradeSummary}</p>
              {subscription?.currentPeriodEnd ? (
                <p className="text-[12px] font-medium">
                  Your {planInfo.name} plan remains active until{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  .
                </p>
              ) : null}
              {BILLABLE_PLAN_IDS.filter((id) =>
                isPlanDowngrade(planId, billablePlanToPlanId(id)),
              ).map((target) => (
                <Button
                  key={target}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={() => setModalDowngrade(target)}
                >
                  Schedule downgrade to {billablePlanDefinition(target).label}
                </Button>
              ))}
              {isPaid ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={() => setModalDowngrade("free")}
                >
                  Cancel subscription (downgrade to Free)
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* E. Compare / view all plans */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-[12px] text-accent hover:underline"
          onClick={() => setShowCompare(true)}
        >
          Compare all plans
        </button>
        <Link href="/pricing" className="text-[12px] font-medium text-accent hover:underline">
          View all plans
        </Link>
      </div>

      <BillingDowngradeModal
        open={modalDowngrade != null}
        onClose={() => setModalDowngrade(null)}
        target={modalDowngrade ?? "free"}
        currentPlanId={planId}
        renewalDate={renewalDate}
        acting={acting}
        onConfirm={async () => {
          if (modalDowngrade) await confirmDowngrade(modalDowngrade);
        }}
      />

      {showCompare ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-background p-5 shadow-xl ring-1 ring-border">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-semibold">Compare plans</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCompare(false)}>
                Close
              </Button>
            </div>
            <table className="mt-4 w-full text-[12px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Plan</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => {
                  if (row.id === "free") {
                    const isCurrent = planId === "free";
                    return (
                      <tr key="free" className="border-t border-border">
                        <td className="py-2">Free</td>
                        <td className="py-2 text-right">
                          {isCurrent ? (
                            <span className="text-muted-foreground">Current plan</span>
                          ) : isPaid ? (
                            <button
                              type="button"
                              className="text-accent hover:underline"
                              onClick={() => {
                                setShowCompare(false);
                                setModalDowngrade("free");
                              }}
                            >
                              Downgrade
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }
                  const resolved = resolvePlanChange({
                    currentPlanId: planId,
                    currentInterval,
                    targetPlan: row.id,
                    targetInterval: currentInterval ?? "monthly",
                  });
                  let actionLabel = "Upgrade";
                  if (resolved.action === "same_plan") actionLabel = "Current plan";
                  else if (resolved.action === "schedule_downgrade") actionLabel = "Downgrade";
                  else if (resolved.action === "highest_plan") actionLabel = "Highest";
                  return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2">{row.label}</td>
                      <td className="py-2 text-right">
                        {resolved.action === "same_plan" ? (
                          <span className="text-muted-foreground">Current plan</span>
                        ) : (
                          <button
                            type="button"
                            className="text-accent hover:underline disabled:opacity-50"
                            disabled={!paddleReady || resolved.action === "highest_plan"}
                            onClick={() => {
                              if (resolved.action === "schedule_downgrade") {
                                setShowCompare(false);
                                setModalDowngrade(row.id);
                              } else if (row.id !== "free") {
                                setShowCompare(false);
                                startUpgrade(row.id);
                              }
                            }}
                          >
                            {actionLabel}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {upgradePlan ? (
        <PlanUpgradeModal
          open
          targetPlanId={upgradePlan}
          interval={upgradeInterval}
          onClose={() => setUpgradePlan(null)}
          onSuccess={() => {
            toast.success("Upgrade submitted — credits refresh after webhook confirmation.");
            onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}
