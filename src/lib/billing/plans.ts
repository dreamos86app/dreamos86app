import type { PlanId } from "@/lib/supabase/types";

/** Monthly credit allowance per plan (DreamOS86 UI: credits). */
export const PLAN_MONTHLY_TOKENS: Record<PlanId, number> = {
  free: 100,
  starter: 1_000,
  pro: 2_500,
  business: 2_500,
  infinity: 5_000,
  enterprise: 5_000,
};

export const PLAN_DISPLAY: Record<
  PlanId,
  { name: string; priceMonthlyUsd: number | null; description: string }
> = {
  free: { name: "Free", priceMonthlyUsd: 0, description: "100 credits / month" },
  starter: { name: "Starter", priceMonthlyUsd: 20, description: "1,000 credits / month" },
  pro: { name: "Pro", priceMonthlyUsd: 50, description: "2,500 credits / month" },
  business: { name: "Pro", priceMonthlyUsd: 50, description: "2,500 credits / month (legacy id)" },
  infinity: { name: "Infinity", priceMonthlyUsd: null, description: "High-volume credits — contact sales" },
  enterprise: { name: "Infinity", priceMonthlyUsd: null, description: "Enterprise tier" },
};

/** Paid plans available via Stripe Checkout (not manual one-click). */
export const STRIPE_CHECKOUT_PLANS = ["starter", "pro", "infinity"] as const;
export type StripeCheckoutPlan = (typeof STRIPE_CHECKOUT_PLANS)[number];

export function isStripeCheckoutPlan(plan: string): plan is StripeCheckoutPlan {
  return (STRIPE_CHECKOUT_PLANS as readonly string[]).includes(plan);
}

export function normalizePlanId(plan: string): PlanId {
  if (plan === "business") return "pro";
  if (plan === "enterprise") return "infinity";
  if (plan in PLAN_MONTHLY_TOKENS) return plan as PlanId;
  return "free";
}

export function monthlyTokensForPlan(plan: PlanId): number {
  return PLAN_MONTHLY_TOKENS[normalizePlanId(plan)] ?? PLAN_MONTHLY_TOKENS.free;
}

export const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_INFINITY_PRICE_ID",
] as const;

export function getStripePriceId(plan: StripeCheckoutPlan): string | null {
  switch (plan) {
    case "starter":
      return process.env.STRIPE_STARTER_PRICE_ID?.trim() || null;
    case "pro":
      return process.env.STRIPE_PRO_PRICE_ID?.trim() || null;
    case "infinity":
      return process.env.STRIPE_INFINITY_PRICE_ID?.trim() || null;
    default:
      return null;
  }
}

export function stripeBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && getStripePriceId("starter"));
}

export function missingStripeEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY?.trim()) missing.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  }
  if (!getStripePriceId("starter")) missing.push("STRIPE_STARTER_PRICE_ID");
  if (!getStripePriceId("pro")) missing.push("STRIPE_PRO_PRICE_ID");
  if (!getStripePriceId("infinity")) missing.push("STRIPE_INFINITY_PRICE_ID");
  return missing;
}
