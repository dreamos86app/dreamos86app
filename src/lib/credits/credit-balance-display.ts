import type { CanonicalCreditBucket } from "@/lib/credits/canonical-credits";
import { formatCreditAmount } from "@/lib/credits/credit-summary";
import { monthlyTokensForPlan, normalizePlanId } from "@/lib/billing/plans";
import { monthlyActionCreditsForPlan } from "@/lib/action-credits/action-credit-allowances";

/** Canonical credit display model — use everywhere (popover, billing, admin). */
export type CreditBucketDisplayModel = {
  remainingTotal: number;
  totalCap: number;
  planAllowance: number;
  bonusAmount: number;
  hasBonus: boolean;
  bonusLabel: string | null;
  displayText: string;
  secondaryText: string | null;
};

/** @deprecated use CreditBucketDisplayModel */
export type CreditBucketDisplay = CreditBucketDisplayModel;

export type CreditBalanceDisplay = {
  plan: string;
  build: CreditBucketDisplayModel;
  action: CreditBucketDisplayModel;
  resetAt: string | null;
};

function planMonthlyAllowance(kind: "build" | "action", planId: string): number {
  const id = normalizePlanId(planId);
  return kind === "build" ? monthlyTokensForPlan(id) : monthlyActionCreditsForPlan(id);
}

function resolveBonusAmount(
  bucket: CanonicalCreditBucket,
  planAllowance: number,
  isConfirmed: boolean,
): number {
  const explicit = Math.max(bucket.bonusActive, 0);
  if (explicit > 0) return explicit;
  if (!isConfirmed) return 0;
  const overflow = Math.max(0, bucket.available - planAllowance);
  return overflow;
}

/** Total spendable cap = plan allowance + bonus (denominator for tracker). */
export function creditBucketTotalCap(
  bucket: CanonicalCreditBucket,
  kind: "build" | "action",
  planId: string,
  isConfirmed: boolean,
): number {
  const planAllowance = Math.max(
    isConfirmed && bucket.planAllowance > 0
      ? bucket.planAllowance
      : planMonthlyAllowance(kind, planId),
    0,
  );
  const bonusAmount = resolveBonusAmount(bucket, planAllowance, isConfirmed);
  return Math.max(planAllowance + bonusAmount, bucket.available, 0);
}

/**
 * Display: remaining_total / total_cap with optional +N bonus (purple).
 * Example Pro 500 + 22 bonus, 13 left → 13/522 +22 bonus
 */
export function formatCreditBucketDisplay(
  bucket: CanonicalCreditBucket,
  kind: "build" | "action",
  planId: string,
  isConfirmed: boolean,
): CreditBucketDisplayModel {
  const planAllowance = Math.max(
    isConfirmed && bucket.planAllowance > 0
      ? bucket.planAllowance
      : planMonthlyAllowance(kind, planId),
    0,
  );
  const bonusAmount = resolveBonusAmount(bucket, planAllowance, isConfirmed);
  const totalCap = Math.max(planAllowance + bonusAmount, bucket.available, 0);
  const remainingTotal = Math.max(0, bucket.available);
  const hasBonus = bonusAmount > 0;
  const bonusLabel = hasBonus ? `+${formatCreditAmount(bonusAmount)} bonus` : null;

  return {
    remainingTotal,
    totalCap,
    planAllowance,
    bonusAmount,
    hasBonus,
    bonusLabel,
    displayText: `${formatCreditAmount(remainingTotal)}/${formatCreditAmount(totalCap)}`,
    secondaryText: bonusLabel,
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
