import {
  detectPaddleSimulation,
  readWebhookIds,
  readWebhookUserId,
  storePaddleWebhookEvent,
  type PaddleWebhookProcessingStatus,
} from "@/lib/billing/paddle-event-store";
import {
  handlePaddleSubscriptionEvent,
  handlePaddleTransactionCompleted,
} from "@/lib/billing/paddle-webhook-handlers";
import { planFromPaddlePriceId } from "@/lib/billing/plan-billing-catalog";
import { paddleEnvironment } from "@/lib/billing/paddle-billing";

const ENTITLEMENT_EVENTS = new Set([
  "transaction.completed",
  "transaction.paid",
]);

const PAYMENT_FAILURE_EVENTS = new Set([
  "transaction.payment_failed",
  "transaction.past_due",
  "subscription.past_due",
  "subscription.payment_failed",
]);

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.canceled",
  "subscription.paused",
  "subscription.resumed",
  "subscription.past_due",
  "subscription.trialing",
]);

const METADATA_ONLY_EVENTS = new Set([
  "transaction.canceled",
  "transaction.updated",
  "customer.created",
  "customer.updated",
  "payment_method.saved",
  "payment_method.deleted",
  "adjustment.created",
  "adjustment.updated",
]);

export type ProcessPaddleWebhookResult = {
  received: true;
  eventId: string;
  eventType: string;
  processingStatus: PaddleWebhookProcessingStatus;
  duplicate: boolean;
};

export async function processPaddleWebhookPayload(input: {
  eventType: string;
  eventId: string;
  data: Record<string, unknown>;
}): Promise<ProcessPaddleWebhookResult> {
  const { eventType, eventId, data } = input;
  const environment = paddleEnvironment();
  const isSimulation = detectPaddleSimulation(eventType, data);
  const userId = readWebhookUserId(data);
  const ids = readWebhookIds(data);
  const mapped = ids.priceId ? planFromPaddlePriceId(ids.priceId) : null;

  let processingStatus: PaddleWebhookProcessingStatus = "received";
  let error: string | null = null;

  const storeBase = {
    paddleEventId: eventId,
    eventType,
    environment,
    isSimulation,
    userId,
    workspaceId: userId,
    paddleCustomerId: ids.customerId,
    paddleSubscriptionId: ids.subscriptionId,
    paddleTransactionId: ids.transactionId,
    paddlePriceId: ids.priceId,
    plan: mapped?.plan ?? null,
    interval: mapped?.interval ?? null,
    error: null as string | null,
    payloadSafe: data,
  };

  if (isSimulation) {
    processingStatus = "received_simulation_or_unlinked";
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error: "simulation",
    });
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  if (!userId) {
    processingStatus = "received_simulation_or_unlinked";
    error = isSimulation ? "simulation" : "missing_user_id";
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error,
    });
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  if (ids.priceId && !mapped) {
    processingStatus = "unknown_price_id";
    error = "unknown_price_id";
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error,
    });
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  if (PAYMENT_FAILURE_EVENTS.has(eventType)) {
    processingStatus = "payment_failed_no_upgrade";
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error: null,
    });
    if (!duplicate && eventType.startsWith("subscription.")) {
      await handlePaddleSubscriptionEvent({ eventType, data, paddleEventId: eventId });
    }
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  if (ENTITLEMENT_EVENTS.has(eventType)) {
    const status = String(data.status ?? "");
    if (status === "completed" || status === "paid" || eventType === "transaction.paid") {
      await handlePaddleTransactionCompleted({ data, paddleEventId: eventId });
      processingStatus = "processed";
    } else {
      processingStatus = "received";
    }
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error: null,
    });
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  if (SUBSCRIPTION_EVENTS.has(eventType) || eventType.startsWith("subscription.")) {
    await handlePaddleSubscriptionEvent({ eventType, data, paddleEventId: eventId });
    processingStatus = "processed";
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error: null,
    });
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  if (METADATA_ONLY_EVENTS.has(eventType) || eventType.startsWith("customer.")) {
    processingStatus = "received";
    const { duplicate } = await storePaddleWebhookEvent({
      ...storeBase,
      processingStatus,
      error: null,
    });
    return { received: true, eventId, eventType, processingStatus, duplicate };
  }

  const { duplicate } = await storePaddleWebhookEvent({
    ...storeBase,
    processingStatus: "received",
    error: null,
  });
  return { received: true, eventId, eventType, processingStatus, duplicate };
}
