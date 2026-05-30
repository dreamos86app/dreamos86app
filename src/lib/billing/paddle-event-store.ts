import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { paddleEnvironment } from "@/lib/billing/paddle-billing";

export type PaddleWebhookProcessingStatus =
  | "received"
  | "processed"
  | "duplicate_ignored"
  | "received_simulation_or_unlinked"
  | "unknown_price_id"
  | "missing_custom_data"
  | "signature_invalid"
  | "failed"
  | "payment_failed_no_upgrade";

export type StoredPaddleWebhookEvent = {
  paddleEventId: string;
  eventType: string;
  environment: string;
  isSimulation: boolean;
  userId: string | null;
  workspaceId: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  paddleTransactionId: string | null;
  paddlePriceId: string | null;
  plan: string | null;
  interval: string | null;
  processingStatus: PaddleWebhookProcessingStatus;
  error: string | null;
  payloadSafe: Record<string, unknown>;
};

function safePayload(data: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...data };
  for (const key of Object.keys(copy)) {
    if (/secret|password|token|card/i.test(key)) delete copy[key];
  }
  return copy;
}

export function detectPaddleSimulation(
  eventType: string,
  data: Record<string, unknown>,
): boolean {
  if (data.origin === "simulation") return true;
  if (data.simulation === true) return true;
  const custom = (data.custom_data ?? {}) as Record<string, unknown>;
  if (custom.simulation === true) return true;
  if (String(eventType).includes("simulation")) return true;
  return false;
}

export function readWebhookIds(data: Record<string, unknown>): {
  customerId: string | null;
  subscriptionId: string | null;
  transactionId: string | null;
  priceId: string | null;
} {
  const priceId =
    (data.items as Array<{ price?: { id?: string } }> | undefined)?.[0]?.price?.id ??
    (data.price_id as string | undefined) ??
    null;
  const subscriptionId = String(
    (data.subscription_id as string | undefined) ??
      (data.subscription as { id?: string } | undefined)?.id ??
      "",
  ) || null;
  const transactionId = String(data.id ?? "") || null;
  const customerId = String(
    (data.customer_id as string | undefined) ??
      (data.customer as { id?: string } | undefined)?.id ??
      "",
  ) || null;
  return { customerId, subscriptionId, transactionId, priceId };
}

export function parseWebhookCustomData(
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  const raw = data.custom_data;
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function readWebhookUserId(data: Record<string, unknown>): string | null {
  const custom = parseWebhookCustomData(data);
  if (!custom) return null;
  const id = custom.user_id ?? custom.userId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Persist webhook receipt (idempotent on stripe_event_id = paddle event id). */
export async function storePaddleWebhookEvent(
  input: StoredPaddleWebhookEvent,
): Promise<{ stored: boolean; duplicate: boolean }> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("billing_events").insert({
    user_id: input.userId,
    stripe_event_id: input.paddleEventId,
    event_type: `paddle.${input.eventType}`,
    amount_usd: 0,
    stripe_customer_id: input.paddleCustomerId,
    stripe_subscription_id: input.paddleSubscriptionId,
    metadata: {
      provider: "paddle",
      paddle_event_id: input.paddleEventId,
      environment: input.environment,
      is_simulation: input.isSimulation,
      workspace_id: input.workspaceId,
      paddle_transaction_id: input.paddleTransactionId,
      paddle_price_id: input.paddlePriceId,
      plan: input.plan,
      interval: input.interval,
      processing_status: input.processingStatus,
      error: input.error,
      payload_safe: input.payloadSafe,
      received_at: new Date().toISOString(),
      processed_at:
        input.processingStatus === "processed" ? new Date().toISOString() : null,
    },
  } as never);

  if (error && String(error.code) === "23505") {
    return { stored: false, duplicate: true };
  }
  if (error) throw error;
  return { stored: true, duplicate: false };
}

export async function logPaddleCheckoutAttempt(input: {
  userId: string;
  plan: string;
  interval: string;
  priceId: string;
  source: string;
  transactionId?: string | null;
  testMode?: boolean;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const eventId = `paddle:checkout:${input.userId}:${Date.now()}`;
  await admin.from("billing_events").insert({
    user_id: input.userId,
    stripe_event_id: eventId,
    event_type: "paddle.checkout.attempt",
    metadata: {
      provider: "paddle",
      environment: paddleEnvironment(),
      plan: input.plan,
      interval: input.interval,
      paddle_price_id: input.priceId,
      source: input.source,
      test_mode: input.testMode ?? false,
      transaction_id: input.transactionId ?? null,
      processing_status: "received",
    },
  } as never);
}
