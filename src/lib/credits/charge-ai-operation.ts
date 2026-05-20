import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ensureUserProfileServer } from "@/lib/auth/ensure-user-profile-server";

type Writer = SupabaseClient<Database>;

export type ChargeAiOperationInput = {
  userId: string;
  userEmail: string;
  amount: number;
  modelId: string;
  mode: string;
  operationId: string;
  conversationId?: string | null;
  projectId?: string | null;
  buildJobId?: string | null;
  providerCostUsd?: number;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  provider?: string | null;
  routeReason?: string | null;
};

export type ChargeAiOperationResult = {
  charged: boolean;
  remaining: number | null;
  error?: string | null;
  idempotent?: boolean;
};

function logCredits(level: "info" | "warn", msg: string, extra?: Record<string, unknown>) {
  const line = `[credits] ${msg}`;
  if (level === "warn") console.warn(line, extra ?? "");
  else console.info(line, extra ?? "");
}

/**
 * Server-authoritative credit charge after successful AI work.
 * Uses charge_tokens RPC (idempotent via operation_id / idempotency_key).
 */
export async function chargeAiOperation(
  writer: Writer,
  input: ChargeAiOperationInput,
): Promise<ChargeAiOperationResult> {
  if (input.amount < 1) {
    logCredits("info", "charge skipped reason", { reason: "invalid_amount" });
    return { charged: false, remaining: null, error: "invalid_amount" };
  }

  const ensured = await ensureUserProfileServer(input.userId, input.userEmail);
  if (!ensured.ok) {
    logCredits("warn", "charge failed", { reason: "ensure_profile", error: ensured.error });
  }

  logCredits("info", "charge start", {
    operation_id: input.operationId,
    mode: input.mode,
    model: input.modelId,
    amount: input.amount,
    user_id: input.userId,
  });

  const { data: creditResultRaw, error: rpcErr } = await writer.rpc("charge_tokens", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: `AI ${input.mode}`,
    p_idempotency_key: input.operationId,
    p_metadata: {
      model_id: input.modelId,
      mode: input.mode,
      conversation_id: input.conversationId,
      project_id: input.projectId,
      operation_id: input.operationId,
      provider_cost_usd: input.providerCostUsd,
      build_job_id: input.buildJobId,
    },
    p_project_id: input.projectId ?? null,
    p_conversation_id: input.conversationId ?? null,
  } as never);

  if (rpcErr) {
    logCredits("warn", "charge failed", { error: rpcErr.message, operation_id: input.operationId });
    await writer.from("ai_usage_logs").insert({
      user_id: input.userId,
      user_email: input.userEmail,
      model_id: input.modelId,
      mode: input.mode,
      provider: input.provider ?? null,
      route_reason: input.routeReason ?? null,
      tokens_charged: 0,
      credits_charged: 0,
      status: "charge_failed",
      error_message: rpcErr.message,
      conversation_id: input.conversationId ?? null,
      operation_id: input.operationId,
      project_id: input.projectId ?? null,
      charged_after_success: false,
    } as never);
    return { charged: false, remaining: null, error: rpcErr.message };
  }

  const creditResult = creditResultRaw as {
    ok?: boolean;
    success?: boolean;
    charged?: boolean;
    remaining?: number;
    balance_after?: number;
    error?: string;
    idempotent?: boolean;
  } | null;

  const charged = Boolean(creditResult?.ok ?? creditResult?.success);
  const remaining =
    typeof creditResult?.balance_after === "number"
      ? creditResult.balance_after
      : typeof creditResult?.remaining === "number"
        ? creditResult.remaining
        : null;

  if (charged && !creditResult?.idempotent) {
    const usageRow: Record<string, unknown> = {
      user_id: input.userId,
      user_email: input.userEmail,
      model_id: input.modelId,
      mode: input.mode,
      provider: input.provider ?? null,
      route_reason: input.routeReason ?? null,
      tokens_charged: input.amount,
      credits_charged: input.amount,
      status: "success",
      conversation_id: input.conversationId ?? null,
      operation_id: input.operationId,
      project_id: input.projectId ?? null,
      charged_after_success: true,
      estimated_provider_cost: input.providerCostUsd ?? 0,
    };

    if (input.tokensInput != null) usageRow.tokens_input = input.tokensInput;
    if (input.tokensOutput != null) usageRow.tokens_output = input.tokensOutput;

    let { error: logErr } = await writer.from("ai_usage_logs").insert(usageRow as never);
    if (logErr?.message?.includes("does not exist") || logErr?.message?.includes("column")) {
      const slim = { ...usageRow };
      delete slim.tokens_input;
      delete slim.tokens_output;
      delete slim.provider;
      delete slim.route_reason;
      delete slim.charged_after_success;
      delete slim.estimated_provider_cost;
      logErr = (await writer.from("ai_usage_logs").insert(slim as never)).error;
    }

    if (typeof remaining === "number") {
      await writer
        .from("profiles")
        .update({
          credits_remaining: remaining,
          tokens_remaining: remaining,
        } as never)
        .eq("id", input.userId);
    }

    logCredits("info", "charge ok", {
      idempotent: creditResult?.idempotent,
      balance_after: remaining,
      operation_id: input.operationId,
    });
  } else if (creditResult?.idempotent) {
    logCredits("info", "charge skipped reason", { reason: "idempotent", operation_id: input.operationId });
  } else {
    logCredits("warn", "charge failed", {
      error: creditResult?.error ?? "not_charged",
      operation_id: input.operationId,
    });
  }

  return {
    charged: charged && !creditResult?.idempotent,
    remaining,
    error: charged ? null : (creditResult?.error ?? "charge_failed"),
    idempotent: creditResult?.idempotent,
  };
}
