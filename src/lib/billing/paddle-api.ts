import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isKnownPaddlePriceId,
  resolvePaddlePriceId,
  toUpgradePolicyInterval,
  type BillablePlanId,
  type CatalogBillingInterval,
} from "@/lib/billing/plan-billing-catalog";
import { logPaddleCheckoutAttempt } from "@/lib/billing/paddle-event-store";
import { assertPaddleCheckoutEnvironment } from "@/lib/billing/paddle-env-consistency";
import {
  missingPaddleEnvVars,
  paddleBillingConfigured,
  paddleEnvironment,
  validateCheckoutPlanInterval,
} from "@/lib/billing/paddle-billing";
import { PADDLE_UPGRADE_PRORATION_MODE } from "@/lib/billing/upgrade-policy";
import { resolvePaddleTransactionCheckoutUrl } from "@/lib/billing/paddle-checkout-url";

function paddleApiBase(): string {
  return paddleEnvironment() === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export type PaddleCheckoutResult =
  | {
      ok: true;
      checkoutUrl: string;
      transactionId?: string;
      paddleCheckoutUrlSent: string | null;
      paddleCheckoutUrlMode: "explicit" | "default";
    }
  | { ok: false; code: "setup_required" | "api_error" | "invalid_price"; error: string; missing?: string[] };

export type PaddleBillingIntent = "new_subscription" | "upgrade" | "interval_change";

export async function createPaddleCheckoutSession(input: {
  planId: BillablePlanId;
  interval?: CatalogBillingInterval;
  userId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  billingIntent?: PaddleBillingIntent;
  source?: "pricing" | "admin_test_checkout" | "settings";
  testMode?: boolean;
}): Promise<PaddleCheckoutResult> {
  const envGate = assertPaddleCheckoutEnvironment();
  if (!envGate.ok) {
    return { ok: false, code: "setup_required", error: envGate.error, missing: envGate.errors };
  }

  if (!paddleBillingConfigured()) {
    return {
      ok: false,
      code: "setup_required",
      error: "Paddle billing is not configured yet.",
      missing: missingPaddleEnvVars(),
    };
  }

  const interval = input.interval ?? "monthly";
  const validated = validateCheckoutPlanInterval(input.planId, interval);
  if (!validated.ok) {
    return { ok: false, code: "invalid_price", error: validated.error };
  }

  const priceId = resolvePaddlePriceId(validated.plan, validated.interval);
  if (!priceId || !isKnownPaddlePriceId(priceId)) {
    return {
      ok: false,
      code: "invalid_price",
      error: "Price ID is not in the DreamOS86 catalog",
    };
  }

  const checkoutUrlResolution = resolvePaddleTransactionCheckoutUrl();
  if (!checkoutUrlResolution.ok) {
    return {
      ok: false,
      code: "setup_required",
      error: checkoutUrlResolution.error,
    };
  }

  const apiKey = process.env.PADDLE_API_KEY!.trim();

  const transactionBody: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    customer: { email: input.email },
    custom_data: {
      user_id: input.userId,
      workspace_id: input.userId,
      plan_id: validated.plan,
      billing_intent: input.billingIntent ?? "new_subscription",
      billing_interval: toUpgradePolicyInterval(validated.interval),
      source: input.source ?? "pricing",
      test_mode: input.testMode ?? false,
    },
  };

  if (checkoutUrlResolution.url) {
    transactionBody.checkout = { url: checkoutUrlResolution.url };
  }

  try {
    const res = await fetch(`${paddleApiBase()}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(transactionBody),
    });

    const json = (await res.json()) as {
      data?: { checkout?: { url?: string }; id?: string };
      error?: { detail?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        code: "api_error",
        error: json.error?.detail ?? `Paddle API ${res.status}`,
      };
    }

    const checkoutUrl = json.data?.checkout?.url;
    if (!checkoutUrl) {
      return { ok: false, code: "api_error", error: "Paddle did not return a checkout URL" };
    }

    await logPaddleCheckoutAttempt({
      userId: input.userId,
      plan: validated.plan,
      interval: validated.interval,
      priceId,
      source: input.source ?? "pricing",
      transactionId: json.data?.id,
      testMode: input.testMode,
    });

    return {
      ok: true,
      checkoutUrl,
      transactionId: json.data?.id,
      paddleCheckoutUrlSent: checkoutUrlResolution.url,
      paddleCheckoutUrlMode: checkoutUrlResolution.mode,
    };
  } catch (e) {
    return {
      ok: false,
      code: "api_error",
      error: e instanceof Error ? e.message : "Paddle request failed",
    };
  }
}

export type PaddleSubscriptionUpdateResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; code: "setup_required" | "api_error" | "invalid_price"; error: string; missing?: string[] };

/**
 * Upgrade an existing Paddle subscription — full plan charge, no proration.
 */
export async function updatePaddleSubscriptionPlan(input: {
  subscriptionId: string;
  planId: BillablePlanId;
  interval?: CatalogBillingInterval;
  userId: string;
  billingIntent?: PaddleBillingIntent;
}): Promise<PaddleSubscriptionUpdateResult> {
  if (!paddleBillingConfigured()) {
    return {
      ok: false,
      code: "setup_required",
      error: "Paddle billing is not configured yet.",
      missing: missingPaddleEnvVars(),
    };
  }

  const interval = input.interval ?? "monthly";
  const validated = validateCheckoutPlanInterval(input.planId, interval);
  if (!validated.ok) {
    return { ok: false, code: "invalid_price", error: validated.error };
  }

  const priceId = resolvePaddlePriceId(validated.plan, validated.interval);
  if (!priceId || !isKnownPaddlePriceId(priceId)) {
    return { ok: false, code: "invalid_price", error: "Price ID is not in the DreamOS86 catalog" };
  }

  const apiKey = process.env.PADDLE_API_KEY!.trim();

  try {
    const res = await fetch(`${paddleApiBase()}/subscriptions/${input.subscriptionId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: PADDLE_UPGRADE_PRORATION_MODE,
        custom_data: {
          user_id: input.userId,
          plan_id: validated.plan,
          billing_intent: input.billingIntent ?? "upgrade",
          billing_interval: toUpgradePolicyInterval(validated.interval),
        },
      }),
    });

    const json = (await res.json()) as {
      data?: { id?: string };
      error?: { detail?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        code: "api_error",
        error: json.error?.detail ?? `Paddle API ${res.status}`,
      };
    }

    return { ok: true, subscriptionId: json.data?.id ?? input.subscriptionId };
  } catch (e) {
    return {
      ok: false,
      code: "api_error",
      error: e instanceof Error ? e.message : "Paddle request failed",
    };
  }
}

export type PaddleCancelSubscriptionResult =
  | { ok: true; cancelAtPeriodEnd: true; currentPeriodEnd: string | null }
  | { ok: false; code: "setup_required" | "api_error"; error: string; missing?: string[] };

/** Cancel renewal at end of current billing period (default Paddle behavior). */
export async function cancelPaddleSubscriptionAtPeriodEnd(subscriptionId: string): Promise<PaddleCancelSubscriptionResult> {
  if (!paddleBillingConfigured()) {
    return {
      ok: false,
      code: "setup_required",
      error: "Paddle billing is not configured yet.",
      missing: missingPaddleEnvVars(),
    };
  }

  const apiKey = process.env.PADDLE_API_KEY!.trim();

  try {
    const res = await fetch(`${paddleApiBase()}/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ effective_from: "next_billing_period" }),
    });

    const json = (await res.json()) as {
      data?: {
        current_billing_period?: { ends_at?: string };
        scheduled_change?: { effective_at?: string };
      };
      error?: { detail?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        code: "api_error",
        error: json.error?.detail ?? `Paddle API ${res.status}`,
      };
    }

    const periodEnd =
      json.data?.current_billing_period?.ends_at ??
      json.data?.scheduled_change?.effective_at ??
      null;

    return { ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd };
  } catch (e) {
    return {
      ok: false,
      code: "api_error",
      error: e instanceof Error ? e.message : "Paddle cancel request failed",
    };
  }
}

/** Verify Paddle-Signature header (Paddle Billing webhooks). */
export function verifyPaddleWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.trim() || !secret.trim()) return false;
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(";").map((p) => {
        const [k, v] = p.trim().split("=");
        return [k, v];
      }),
    );
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;
    const payload = `${ts}:${rawBody}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    return timingSafeEqual(Buffer.from(h1), Buffer.from(expected));
  } catch {
    return false;
  }
}
