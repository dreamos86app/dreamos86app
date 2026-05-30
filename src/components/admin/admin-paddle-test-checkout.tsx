"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { BillablePlanId } from "@/lib/billing/billable-plans";
import {
  catalogAmountUsd,
  maskId,
  resolveCatalogTier,
  resolvePaddlePriceId,
} from "@/lib/billing/plan-billing-catalog";
import type { PaddleAdminConfigStatus } from "@/lib/billing/paddle-config-status";
import { resolveBillablePlanAction } from "@/lib/billing/plan-action-resolver";
import { normalizePlanId } from "@/lib/billing/plans";

const TEST_PRESETS: { plan: BillablePlanId; interval: "monthly" | "annual"; label: string }[] = [
  { plan: "starter", interval: "monthly", label: "Starter monthly" },
  { plan: "pro", interval: "annual", label: "Pro annual" },
  { plan: "infinity_i", interval: "monthly", label: "Infinity I monthly" },
  { plan: "infinity_iv", interval: "monthly", label: "Infinity IV monthly" },
];

type Props = {
  userId: string;
  userEmail: string;
  config: PaddleAdminConfigStatus;
};

export function AdminPaddleTestCheckout({ userId, userEmail, config }: Props) {
  const [plan, setPlan] = React.useState<BillablePlanId>("starter");
  const [interval, setInterval] = React.useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = React.useState(false);
  const [checkoutState, setCheckoutState] = React.useState<
    "idle" | "opening" | "waiting_webhook" | "error" | "active"
  >("idle");
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [lastResponse, setLastResponse] = React.useState<Record<string, unknown> | null>(null);
  const [billingStatus, setBillingStatus] = React.useState<Record<string, unknown> | null>(null);
  const [currentPlanId, setCurrentPlanId] = React.useState<string>("free");

  const tier = resolveCatalogTier(plan, interval);
  const priceId = resolvePaddlePriceId(plan, interval);
  const amountUsd = catalogAmountUsd(plan, interval);
  const planAction = resolveBillablePlanAction(currentPlanId, plan);

  const customDataPreview = {
    user_id: userId,
    plan_id: plan,
    interval,
    billing_intent: "new_subscription",
    source: "admin_test_checkout",
  };

  React.useEffect(() => {
    void fetch("/api/billing/subscription", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { planId?: string };
        if (json.planId) setCurrentPlanId(json.planId);
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (checkoutState !== "waiting_webhook") return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const res = await fetch("/api/billing/status", { credentials: "include" });
      const json = (await res.json()) as Record<string, unknown> & {
        active?: boolean;
        webhookPending?: boolean;
        message?: string;
      };
      if (cancelled) return;
      setBillingStatus(json);
      if (json.active || attempts > 40) {
        setCheckoutState(json.active ? "active" : "waiting_webhook");
        return;
      }
      window.setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [checkoutState]);

  async function startCheckout() {
    if (!config.checkoutReady) {
      toast.error("Paddle is not fully configured — fix missing env vars first.");
      return;
    }
    setBusy(true);
    setLastError(null);
    setCheckoutState("opening");
    setLastResponse(null);
    try {
      const res = await fetch("/api/billing/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan,
          interval,
          confirmed: true,
          testMode: true,
          source: "admin_test_checkout",
        }),
      });
      const json = (await res.json()) as Record<string, unknown> & { url?: string; error?: string };
      setLastResponse(json);
      if (!res.ok) throw new Error(json.error ?? "Checkout failed");
      setCheckoutState("waiting_webhook");
      if (json.url) window.location.href = String(json.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout failed";
      setLastError(msg);
      setCheckoutState("error");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!config.checkoutReady) {
    return (
      <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
        <p className="text-[14px] font-semibold text-destructive">Paddle configuration incomplete</p>
        <p className="text-[13px] text-muted-foreground">
          Fix the missing variables below before running a live checkout test.
        </p>
        {config.missingEnv.length > 0 ? (
          <ul className="list-disc pl-5 text-[12px] text-muted-foreground">
            {config.missingEnv.map((key) => (
              <li key={key} className="font-mono">
                {key}
              </li>
            ))}
          </ul>
        ) : null}
        {config.missingPriceIds.length > 0 ? (
          <ul className="list-disc pl-5 text-[12px] text-muted-foreground">
            {config.missingPriceIds.map((row) => (
              <li key={`${row.plan}-${row.interval}`}>
                {row.plan} · {row.interval}
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/admin/billing/paddle" className="text-[13px] text-accent hover:underline">
          ← Back to Paddle readiness
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px]">
        <p className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          {config.environment === "production" ? "Live mode — real charges" : "Sandbox mode"}
        </p>
        <p className="mt-1 text-muted-foreground">
          Owner-only checkout. Entitlements apply only after a verified webhook with your user ID in custom_data.
        </p>
        {config.checkoutUrl.localDevLiveWarning ? (
          <p className="mt-2 font-medium text-amber-900 dark:text-amber-100">
            {config.checkoutUrl.localDevLiveWarning}
          </p>
        ) : null}
      </div>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-[14px] font-semibold">Environment</h2>
        <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Paddle environment</dt>
            <dd className="font-medium capitalize">{config.environment}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Public checkout</dt>
            <dd className="font-medium">{config.publicCheckoutEnabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Checkout URL sent to Paddle</dt>
            <dd className="font-mono text-[11px] break-all">
              {config.checkoutUrl.mode === "default"
                ? "Default (omitted — Paddle approved payment link)"
                : config.checkoutUrl.displayLabel}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Checkout URL mode</dt>
            <dd className="font-medium capitalize">{config.checkoutUrl.mode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PADDLE_CHECKOUT_URL env</dt>
            <dd className="font-medium">{config.checkoutUrl.envConfigured ? "Set" : "Not set"}</dd>
          </div>
          {config.checkoutUrl.setupError ? (
            <div className="sm:col-span-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-destructive">
              {config.checkoutUrl.setupError}
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Owner test checkout</dt>
            <dd className="font-medium">{config.ownerTestCheckoutEnabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Signed-in user</dt>
            <dd className="font-mono text-[11px] break-all">{userEmail}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">User ID (custom_data)</dt>
            <dd className="font-mono text-[11px] break-all">{userId}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Workspace / account</dt>
            <dd className="font-mono text-[11px] break-all">{userId}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-[14px] font-semibold">Test presets</h2>
        <div className="flex flex-wrap gap-2">
          {TEST_PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPlan(p.plan);
                setInterval(p.interval);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[12px]">
            <span className="text-muted-foreground">Plan</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
              value={plan}
              onChange={(e) => setPlan(e.target.value as BillablePlanId)}
            >
              {[
                "starter",
                "pro",
                "infinity_i",
                "infinity_ii",
                "infinity_iii",
                "infinity_iv",
                "infinity_v",
                "infinity_vi",
                "infinity_vii",
              ].map((id) => (
                <option key={id} value={id}>
                  {resolveBillablePlanAction(currentPlanId, id).label} · {id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px]">
            <span className="text-muted-foreground">Interval</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
              value={interval}
              onChange={(e) => setInterval(e.target.value as "monthly" | "annual")}
            >
              <option value="monthly">monthly</option>
              <option value="annual">annual</option>
            </select>
          </label>
        </div>

        <dl className="rounded-lg bg-muted/30 px-3 py-2 text-[12px] space-y-1.5">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Resolved price ID</dt>
            <dd className="font-mono text-[11px]">{priceId ? maskId(priceId) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Expected amount</dt>
            <dd className="font-medium">${amountUsd} USD / {interval}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Catalog tier</dt>
            <dd>{tier?.displayText ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Your current plan</dt>
            <dd>{normalizePlanId(currentPlanId)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Action label (pricing rules)</dt>
            <dd>{planAction.label}</dd>
          </div>
        </dl>

        <div>
          <p className="text-[11px] font-medium text-muted-foreground">custom_data preview</p>
          <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-background px-2 py-2 font-mono text-[10px] ring-1 ring-border">
            {JSON.stringify(customDataPreview, null, 2)}
          </pre>
        </div>

        <Button type="button" disabled={busy} onClick={() => void startCheckout()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Open live Paddle checkout
        </Button>

        {checkoutState === "waiting_webhook" ? (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[12px]">
            <Loader2 className="size-4 animate-spin text-accent" />
            Waiting for Paddle webhook…
            <button
              type="button"
              className="ml-auto text-accent hover:underline"
              onClick={() => setCheckoutState("waiting_webhook")}
            >
              <RefreshCw className="size-3.5 inline" /> Poll
            </button>
          </div>
        ) : null}

        {checkoutState === "active" ? (
          <p className="text-[12px] text-positive font-medium">Plan active — webhook confirmed.</p>
        ) : null}

        {lastError ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{lastError}</p>
        ) : null}
      </section>

      {lastResponse ? (
        <section className="rounded-xl border border-border bg-muted/20 p-4">
          <h2 className="text-[14px] font-semibold">Last checkout response</h2>
          <pre className="mt-2 max-h-48 overflow-auto text-[11px]">{JSON.stringify(lastResponse, null, 2)}</pre>
        </section>
      ) : null}

      {billingStatus ? (
        <section className="rounded-xl border border-border bg-muted/20 p-4">
          <h2 className="text-[14px] font-semibold">Billing status poll</h2>
          <pre className="mt-2 max-h-40 overflow-auto text-[11px]">{JSON.stringify(billingStatus, null, 2)}</pre>
          {config.recentEvents.length > 0 ? (
            <>
              <p className="mt-3 text-[12px] font-medium">Recent Paddle events</p>
              <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                {config.recentEvents.slice(0, 5).map((ev) => (
                  <li key={ev.id} className="font-mono">
                    {ev.createdAt} · {ev.eventType} · {ev.processingStatus ?? "—"}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <p className="text-[12px] text-muted-foreground">
        <Link href="/admin/billing/paddle" className="text-accent hover:underline">
          ← Back to Paddle readiness
        </Link>
        {" · "}
        <Link href="/settings/billing?paddle=success" className="text-accent hover:underline">
          Billing after checkout
          <ExternalLink className="ml-0.5 inline size-3" />
        </Link>
      </p>
    </div>
  );
}
