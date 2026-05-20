import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireDreamosOwner } from "@/lib/admin/require-owner";
import {
  estimateOwnerMarginUsd,
  estimateOwnerRevenueUsd,
  estimateProviderCostUsd,
} from "@/lib/credits/usage-cost";

type UsageRow = {
  model_id: string;
  mode: string;
  tokens_charged: number;
  tokens_input: number | null;
  tokens_output: number | null;
  status: string;
  conversation_id: string | null;
  project_id?: string | null;
};

export async function GET() {
  const gate = await requireDreamosOwner();
  if (gate.error) return gate.error;

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data, error } = await admin
    .from("ai_usage_logs")
    .select(
      "model_id,mode,tokens_charged,tokens_input,tokens_output,status,conversation_id",
    )
    .eq("status", "success")
    .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UsageRow[];

  type Bucket = {
    requests: number;
    credits: number;
    providerCostUsd: number;
    revenueUsd: number;
    marginUsd: number;
  };

  const empty = (): Bucket => ({
    requests: 0,
    credits: 0,
    providerCostUsd: 0,
    revenueUsd: 0,
    marginUsd: 0,
  });

  const byModelMode: Record<string, Bucket> = {};
  const byMode: Record<string, Bucket> = {};
  const chatOnly = empty();
  const createModes = empty();
  const totals = empty();

  for (const row of rows) {
    const charged = row.tokens_charged ?? 0;
    if (charged <= 0) continue;
    const provider = estimateProviderCostUsd(
      row.model_id,
      row.mode,
      row.tokens_input,
      row.tokens_output,
    );
    const revenue = estimateOwnerRevenueUsd(charged);
    const margin = estimateOwnerMarginUsd(charged, provider);

    const add = (b: Bucket) => {
      b.requests += 1;
      b.credits += charged;
      b.providerCostUsd += provider;
      b.revenueUsd += revenue;
      b.marginUsd += margin;
    };

    add(totals);
    add(byMode[row.mode] ?? (byMode[row.mode] = empty()));

    const mmKey = `${row.model_id}::${row.mode}`;
    add(byModelMode[mmKey] ?? (byModelMode[mmKey] = empty()));

    const isChatDiscuss = row.mode === "discuss";
    if (isChatDiscuss) add(chatOnly);
    else add(createModes);
  }

  return NextResponse.json({
    totals,
    byMode,
    byModelMode,
    chatOnly,
    createModes,
    eventCount: rows.length,
    marginTarget: "3× provider cost (credits priced in cost-engine)",
  });
}
