import { billablePlanDefinition, infinityTierIdToBillablePlan } from "@/lib/billing/billable-plans";
import { normalizePlanId, PLAN_DISPLAY } from "@/lib/billing/plans";
import { planRank } from "@/lib/billing/upgrade-policy";
import type { PlanId } from "@/lib/supabase/types";

/** Pricing card / marketing target ids (includes free + infinity bundle). */
export type PlanActionTargetId =
  | "free"
  | "starter"
  | "pro"
  | "infinity"
  | `inf-${1 | 2 | 3 | 4 | 5 | 6 | 7}`;

export type PlanActionKind = "current" | "upgrade" | "downgrade" | "get" | "signup";

export type ResolvedPlanAction = {
  kind: PlanActionKind;
  label: string;
  disabled: boolean;
  /** Normalized PlanId for rank comparison (infinity tiers → infinity_i …). */
  targetPlanId: PlanId;
};

const INFINITY_TIER_LABELS: Record<string, string> = {
  "inf-1": "Infinity I",
  "inf-2": "Infinity II",
  "inf-3": "Infinity III",
  "inf-4": "Infinity IV",
  "inf-5": "Infinity V",
  "inf-6": "Infinity VI",
  "inf-7": "Infinity VII",
};

export function planActionTargetToPlanId(target: PlanActionTargetId): PlanId {
  if (target === "free") return "free";
  if (target === "starter") return "starter";
  if (target === "pro") return "pro";
  if (target === "infinity") return "infinity_i";
  if (target.startsWith("inf-")) {
    const billable = infinityTierIdToBillablePlan(target);
    if (billable) return billablePlanDefinition(billable).storagePlanId;
    return "infinity_i";
  }
  return normalizePlanId(target);
}

export function displayNameForPlanActionTarget(target: PlanActionTargetId): string {
  if (target in INFINITY_TIER_LABELS) return INFINITY_TIER_LABELS[target];
  if (target === "infinity") return "Infinity I";
  const planId = planActionTargetToPlanId(target);
  return PLAN_DISPLAY[planId]?.name ?? planId;
}

function isCurrentPlan(currentPlanId: string, target: PlanActionTargetId): boolean {
  const current = normalizePlanId(currentPlanId);
  const targetPlan = planActionTargetToPlanId(target);
  if (target === "infinity" && current.startsWith("infinity")) {
    return targetPlan === current || (current === "infinity" && targetPlan === "infinity_i");
  }
  if (target.startsWith("inf-")) {
    return planActionTargetToPlanId(target) === current;
  }
  return current === targetPlan;
}

/**
 * Central CTA label + disabled state for pricing, billing, and account UI.
 */
export function resolvePlanAction(
  currentPlanId: string | null | undefined,
  target: PlanActionTargetId,
  options?: { publicMode?: boolean },
): ResolvedPlanAction {
  const targetPlanId = planActionTargetToPlanId(target);
  const displayName = displayNameForPlanActionTarget(target);
  const current = normalizePlanId(currentPlanId ?? "free");
  const currentRank = planRank(current);
  const targetRank = planRank(targetPlanId);

  if (options?.publicMode) {
    if (target === "free") {
      return { kind: "signup", label: "Get started free", disabled: false, targetPlanId };
    }
    return {
      kind: "get",
      label: target === "starter" ? "Get Starter" : `Get ${displayName}`,
      disabled: false,
      targetPlanId,
    };
  }

  if (isCurrentPlan(current, target)) {
    return { kind: "current", label: "Current plan", disabled: true, targetPlanId };
  }

  if (targetRank < currentRank) {
    return {
      kind: "downgrade",
      label: `Downgrade to ${displayName}`,
      disabled: false,
      targetPlanId,
    };
  }

  if (targetRank > currentRank) {
    if (current === "free" && target === "starter") {
      return { kind: "get", label: "Get Starter", disabled: false, targetPlanId };
    }
    return {
      kind: "upgrade",
      label: `Upgrade to ${displayName}`,
      disabled: false,
      targetPlanId,
    };
  }

  return { kind: "current", label: "Current plan", disabled: true, targetPlanId };
}

const INFINITY_SUFFIX_TO_TARGET: Record<string, PlanActionTargetId> = {
  i: "inf-1",
  ii: "inf-2",
  iii: "inf-3",
  iv: "inf-4",
  v: "inf-5",
  vi: "inf-6",
  vii: "inf-7",
};

/** Billable plan row on settings billing — uses storage plan ids directly. */
export function resolveBillablePlanAction(
  currentPlanId: string | null | undefined,
  targetBillable: string,
): ResolvedPlanAction {
  if (targetBillable === "free") return resolvePlanAction(currentPlanId, "free");
  if (targetBillable === "starter") return resolvePlanAction(currentPlanId, "starter");
  if (targetBillable === "pro") return resolvePlanAction(currentPlanId, "pro");
  if (targetBillable.startsWith("infinity_")) {
    const suffix = targetBillable.replace(/^infinity_/, "");
    return resolvePlanAction(currentPlanId, INFINITY_SUFFIX_TO_TARGET[suffix] ?? "inf-1");
  }
  return resolvePlanAction(currentPlanId, "starter");
}

export function isPlanActionTargetCurrent(
  currentPlanId: string | null | undefined,
  target: PlanActionTargetId,
): boolean {
  return resolvePlanAction(currentPlanId, target).kind === "current";
}
