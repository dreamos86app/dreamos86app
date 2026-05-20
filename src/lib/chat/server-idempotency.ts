import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Writer = SupabaseClient<Database>;

/** Skip duplicate charge when this operation already succeeded. */
export async function hasSuccessfulChargeForOperation(
  writer: Writer,
  userId: string,
  operationId: string,
): Promise<boolean> {
  const { data } = await writer
    .from("ai_usage_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("operation_id", operationId)
    .eq("status", "success")
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

/** Skip duplicate running build for same project + prompt within 2 minutes. */
export async function hasRecentRunningBuildJob(
  writer: Writer,
  projectId: string,
  prompt: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await writer
    .from("build_jobs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "running")
    .eq("prompt", prompt)
    .gte("started_at", since)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

/** Skip duplicate user message for same operation_id in conversation. */
export async function hasUserMessageForOperation(
  writer: Writer,
  conversationId: string,
  operationId: string,
): Promise<boolean> {
  const { data } = await writer
    .from("messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data?.length) return false;
  return data.some((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return meta?.operation_id === operationId;
  });
}
