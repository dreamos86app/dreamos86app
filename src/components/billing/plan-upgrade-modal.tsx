"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillablePlanId } from "@/lib/billing/billable-plans";
import { UPGRADE_POLICY_COPY } from "@/lib/billing/upgrade-policy";

export type UpgradePreview = {
  currentPlan: { id: string; name: string };
  newPlan: {
    id: string;
    name: string;
    buildCredits: number;
    actionCredits: number;
  };
  amountDueTodayUsd: number | null;
  proratedAmountUsd: null;
  newRenewalDate: string;
  policyMessage: string;
};

type PlanUpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  targetPlanId: BillablePlanId;
  interval?: "monthly" | "yearly";
  onSuccess?: () => void;
};

export function PlanUpgradeModal({
  open,
  onClose,
  targetPlanId,
  interval = "monthly",
  onSuccess,
}: PlanUpgradeModalProps) {
  const [preview, setPreview] = React.useState<UpgradePreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void fetch(
      `/api/billing/paddle/upgrade/preview?planId=${targetPlanId}&interval=${interval}`,
    )
      .then(async (res) => {
        const json = (await res.json()) as UpgradePreview & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not load upgrade preview");
        setPreview(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Preview failed"))
      .finally(() => setLoading(false));
  }, [open, targetPlanId, interval]);

  async function confirmUpgrade() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/paddle/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: targetPlanId, interval, confirmed: true }),
      });
      const json = (await res.json()) as {
        url?: string;
        error?: string;
        mode?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Upgrade failed");

      if (json.url) {
        window.location.href = json.url;
        return;
      }

      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setConfirming(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby="upgrade-modal-title"
        className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-xl ring-1 ring-border"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <h2 id="upgrade-modal-title" className="text-lg font-semibold">
          Upgrade plan
        </h2>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <p className="mt-4 text-[13px] text-destructive">{error}</p>
        )}

        {preview && !loading && (
          <div className="mt-4 space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface px-3 py-2 ring-1 ring-border">
                <p className="text-[10px] uppercase text-muted-foreground">Current</p>
                <p className="font-semibold">{preview.currentPlan.name}</p>
              </div>
              <div className="rounded-lg bg-accent/10 px-3 py-2 ring-1 ring-accent/20">
                <p className="text-[10px] uppercase text-muted-foreground">New plan</p>
                <p className="font-semibold text-accent">{preview.newPlan.name}</p>
              </div>
            </div>

            <div className="rounded-lg bg-surface px-3 py-3 ring-1 ring-border space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{UPGRADE_POLICY_COPY.amountDueToday}</span>
                <span className="font-bold tabular-nums">
                  ${preview.amountDueTodayUsd ?? "—"}
                </span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">New renewal date</span>
                <span>{new Date(preview.newRenewalDate).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Build Credits</span>
                <span>{preview.newPlan.buildCredits.toLocaleString()} / mo</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Action Credits</span>
                <span>{preview.newPlan.actionCredits.toLocaleString()} / mo</span>
              </div>
            </div>

            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {preview.policyMessage}
            </p>
            <p className="text-[11px] text-muted-foreground/80">{UPGRADE_POLICY_COPY.noProration}</p>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={confirming}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={confirming} onClick={() => void confirmUpgrade()}>
                {confirming ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  `Pay $${preview.amountDueTodayUsd ?? ""} today`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
