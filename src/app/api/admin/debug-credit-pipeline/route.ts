import { NextResponse } from "next/server";
import { requireDreamosOwner } from "@/lib/admin/require-owner";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireDreamosOwner();
  if (gate.error) return gate.error;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const userId = gate.user.id;

  const { data: profileRaw } = await admin
    .from("profiles")
    .select("id, email, plan_id, tokens_remaining, credits_remaining")
    .eq("id", userId)
    .maybeSingle();

  const profile = profileRaw as {
    credits_remaining?: number | null;
    tokens_remaining?: number | null;
    plan_id?: string | null;
    email?: string | null;
  } | null;

  const { error: rpcProbe } = await admin.rpc("charge_tokens", {
    p_user_id: userId,
    p_amount: 0,
    p_reason: "probe",
    p_idempotency_key: `probe:${userId}:${Date.now()}`,
    p_metadata: { probe: true },
    p_project_id: null,
    p_conversation_id: null,
  } as never);

  const chargeTokensRpcExists =
    !rpcProbe ||
    !rpcProbe.message.includes("function") ||
    !rpcProbe.message.toLowerCase().includes("does not exist");

  const { data: usageRaw } = await admin
    .from("ai_usage_logs")
    .select("id, mode, model_id, status, operation_id, error_message, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const usage = (usageRaw ?? []) as Array<{
    id: string;
    mode: string | null;
    model_id: string | null;
    status: string | null;
    operation_id: string | null;
    error_message: string | null;
    created_at: string;
  }>;

  const { data: creditEvents } = await admin
    .from("credit_events")
    .select("id, amount, reason, idempotency_key, created_at, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: ledger } = await admin
    .from("token_ledger")
    .select("id, delta, reason, idempotency_key, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const lastFailed = (usage ?? []).find((r) => r.status === "charge_failed" || r.status === "error");

  return NextResponse.json({
    user_id: userId,
    profile_credits_remaining:
      profile?.credits_remaining ?? profile?.tokens_remaining ?? null,
    profile_plan_id: profile?.plan_id ?? null,
    charge_tokens_rpc_exists: chargeTokensRpcExists,
    charge_tokens_rpc_probe_error: rpcProbe?.message ?? null,
    ai_usage_logs: usage ?? [],
    credit_events: creditEvents ?? [],
    token_ledger: ledger ?? [],
    last_failed_charge: lastFailed
      ? {
          status: lastFailed.status,
          error_message: lastFailed.error_message,
          operation_id: lastFailed.operation_id,
          at: lastFailed.created_at,
        }
      : null,
  });
}
