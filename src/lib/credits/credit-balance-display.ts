import type { CanonicalCreditBucket } from "@/lib/credits/canonical-credits";
import { formatCreditAmount } from "@/lib/credits/credit-summary";
import { monthlyTokensForPlan, normalizePlanId } from "@/lib/billing/plans";
import { monthlyActionCreditsForPlan } from "@/lib/action-credits/action-credit-allowances";

export type CreditBucketDisplay = {
  remaining: number;
  monthlyAllowance: number;
  bonusOrTopUp: number;
  displayText: string;
  secondaryText: string | null;
};

export type CreditBalanceDisplay = {
  plan: string;
  build: CreditBucketDisplay;
  action: CreditBucketDisplay;
  resetAt: string | null;
};

function planMonthlyAllowance(kind: "build" | "action", planId: string): number {
  const id = normalizePlanId(planId);
  return kind === "build" ? monthlyTokensForPlan(id) : monthlyActionCreditsForPlan(id);
}

/** Spendable cap = plan allowance + explicit bonus (e.g. free 30 + grant 5 → 35). */
export function creditBucketTotalCap(
  bucket: CanonicalCreditBucket,
  kind: "build" | "action",
  planId: string,
  isConfirmed: boolean,
): number {
  const monthlyAllowance = Math.max(
    isConfirmed && bucket.planAllowance > 0
      ? bucket.planAllowance
      : planMonthlyAllowance(kind, planId),
    0,
  );
  const explicitBonus = Math.max(bucket.bonusActive, 0);
  const overflowBonus = Math.max(0, bucket.available - monthlyAllowance);
  const bonusOrTopUp = explicitBonus > 0 ? explicitBonus : overflowBonus;
  return Math.max(monthlyAllowance + bonusOrTopUp, bucket.available);
}

/**
 * Canonical remaining / cap display (e.g. 35/35 when plan is 30 + 5 bonus).
 */
export function formatCreditBucketDisplay(
  bucket: CanonicalCreditBucket,
  kind: "build" | "action",
  planId: string,
  isConfirmed: boolean,
): CreditBucketDisplay {
  const monthlyAllowance = Math.max(
    isConfirmed && bucket.planAllowance > 0
      ? bucket.planAllowance
      : planMonthlyAllowance(kind, planId),
    0,
  );
  const explicitBonus = Math.max(bucket.bonusActive, 0);
  const rawRemaining = Math.max(0, bucket.available);
  const overflowBonus = Math.max(0, rawRemaining - monthlyAllowance);
  const bonusOrTopUp = explicitBonus > 0 ? explicitBonus : overflowBonus;
  const totalCap = creditBucketTotalCap(bucket, kind, planId, isConfirmed);

  const displayText = `${formatCreditAmount(rawRemaining)}/${formatCreditAmount(totalCap)}`;

  return {
    remaining: rawRemaining,
    monthlyAllowance,
    bonusOrTopUp,
    displayText,
    secondaryText: null,
  };
}

export function formatCreditBalanceDisplay(input: {
  build: CanonicalCreditBucket;
  action: CanonicalCreditBucket;
  planId: string;
  isConfirmed: boolean;
}): CreditBalanceDisplay {
  return {
    plan: normalizePlanId(input.planId),
    build: formatCreditBucketDisplay(input.build, "build", input.planId, input.isConfirmed),
    action: formatCreditBucketDisplay(input.action, "action", input.planId, input.isConfirmed),
    resetAt: input.build.resetDate ?? input.action.resetDate ?? null,
  };
}

/** Profile seed hint — clamp inflated profile balance before canonical API load. */
export function clampProfileSeedAvailable(
  rawAvailable: number,
  monthlyAllowance: number,
): { available: number; impliedBonus: number } {
  const allowance = Math.max(monthlyAllowance, 0);
  if (rawAvailable <= allowance) {
    return { available: rawAvailable, impliedBonus: 0 };
  }
  return { available: allowance, impliedBonus: rawAvailable - allowance };
}
