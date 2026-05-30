import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ModelSlice = {
  modelId: string;
  tokens: number;
  percent: number;
  inputTokens: number;
  outputTokens: number;
};

export async function GET() {
  const user = await getServerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_reset_at, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const periodStart =
    profile?.credits_reset_at ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("ai_usage_logs")
    .select("model_id, tokens_input, tokens_output, tokens_charged, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "success")
    .gte("created_at", periodStart)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byModel = new Map<string, { input: number; output: number }>();
  for (const row of rows ?? []) {
    const modelId = row.model_id?.trim() || "unknown";
    const cur = byModel.get(modelId) ?? { input: 0, output: 0 };
    cur.input += row.tokens_input ?? 0;
    cur.output += row.tokens_output ?? 0;
    if (!row.tokens_input && !row.tokens_output && row.tokens_charged) {
      cur.output += row.tokens_charged;
    }
    byModel.set(modelId, cur);
  }

  let totalTokens = 0;
  const models: ModelSlice[] = [];
  for (const [modelId, t] of byModel) {
    const tokens = t.input + t.output;
    if (tokens <= 0) continue;
    totalTokens += tokens;
    models.push({
      modelId,
      tokens,
      percent: 0,
      inputTokens: t.input,
      outputTokens: t.output,
    });
  }

  models.sort((a, b) => b.tokens - a.tokens);
  for (const m of models) {
    m.percent = totalTokens > 0 ? Math.round((m.tokens / totalTokens) * 1000) / 10 : 0;
  }

  const percentSum = models.reduce((s, m) => s + m.percent, 0);
  if (models.length > 0 && Math.abs(percentSum - 100) > 0.5) {
    models[0]!.percent += Math.round((100 - percentSum) * 10) / 10;
  }

  return NextResponse.json({
    periodStart,
    totalTokens,
    models,
    eventCount: rows?.length ?? 0,
    estimatedOnly: false,
  });
}
