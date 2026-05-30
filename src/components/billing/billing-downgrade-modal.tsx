"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { billablePlanDefinition, type BillablePlanId } from "@/lib/billing/billable-plans";
import { PLAN_DISPLAY } from "@/lib/billing/plans";

type Props = {
  open: boolean;
  onClose: () => void;
  target: BillablePlanId | "free";
  currentPlanId: string;
  renewalDate: string | null;
  onConfirm: () => Promise<void>;
  acting?: boolean;
};

export function BillingDowngradeModal({
  open,
  onClose,
  target,
  currentPlanId,
  renewalDate,
  onConfirm,
  acting = false,
}: Props) {
  if (!open) return null;

  const currentName = PLAN_DISPLAY[currentPlanId as keyof typeof PLAN_DISPLAY]?.name ?? currentPlanId;
  const targetLabel =
    target === "free" ? "Free" : billablePlanDefinition(target).label;
  const isCancel = target === "free";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-foreground">
            {isCancel ? "Cancel subscription" : `Schedule downgrade to ${targetLabel}`}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {isCancel ? (
            <>
              Your {currentName} plan stays active until {renewalDate ?? "the end of your billing period"}. You
              will not be charged again. Free starts after your paid period ends.
            </>
          ) : (
            <>
              Your {currentName} plan stays active until {renewalDate ?? "your next renewal"}. {targetLabel}{" "}
              begins on your next renewal date.
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={acting}>
            {isCancel ? "Keep plan" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant={isCancel ? "destructive" : "primary"}
            disabled={acting}
            onClick={() => void onConfirm()}
          >
            {acting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            {isCancel ? "Continue to cancellation" : "Schedule downgrade"}
          </Button>
        </div>
      </div>
    </div>
  );
}
