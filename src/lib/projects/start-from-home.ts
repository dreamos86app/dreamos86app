import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import type { Database } from "@/lib/supabase/types";
import { classifyFirstCreatePrompt } from "@/lib/intent/create-intent-classifier";
import { createProjectFromPrompt } from "@/lib/projects/create-project-from-prompt";
import { ensureProjectConversation } from "@/lib/projects/project-conversation";
import { buildBuilderUrl } from "@/lib/navigation/builder-url";
import { DEFAULT_MODEL_ID } from "@/lib/creation/models";
import type { BuildStrategy } from "@/lib/create/autostart-handoff";

type Writer = SupabaseClient<Database>;

export type StartFromHomeInput = {
  writer: Writer;
  user: User;
  prompt: string;
  strategy: BuildStrategy;
  selectedModel?: string | null;
  idempotencyKey?: string | null;
};

export type StartFromHomeResult =
  | {
      ok: true;
      intent: "build";
      projectId: string;
      conversationId: string;
      jobId: string | null;
      builderUrl: string;
      messageId: string | null;
    }
  | {
      ok: true;
      intent: "question";
      discussUrl: string;
      userMessage: string;
    }
  | { ok: false; error: string; code: string; userMessage?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until the project row is visible to the owner (PostgREST / RLS warm-up). */
export async function waitForProjectReadable(
  writer: Writer,
  userId: string,
  projectId: string,
  maxMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { data, error } = await writer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!error && data?.id) return true;
    await sleep(150);
  }
  return false;
}

export async function startProjectFromHome(
  input: StartFromHomeInput,
): Promise<StartFromHomeResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, error: "Prompt is required", code: "empty_prompt" };
  }

  const intent = classifyFirstCreatePrompt(prompt);
  const isQuestion =
    intent.intent === "question_only" ||
    intent.intent === "support_question" ||
    intent.intent === "pricing_question" ||
    Boolean(intent.shouldAnswerQuestion && !intent.shouldCreateProject);

  if (isQuestion) {
    const discussQs = new URLSearchParams({
      mode: "discuss",
      skipDraft: "1",
      autostart: "1",
    });
    if (input.idempotencyKey) discussQs.set("handoff", input.idempotencyKey);
    return {
      ok: true,
      intent: "question",
      discussUrl: `/create?${discussQs.toString()}`,
      userMessage: intent.userMessage,
    };
  }

  if (intent.needsClarification && !intent.shouldCreateProject) {
    return {
      ok: false,
      error: intent.clarificationPrompt ?? intent.userMessage,
      code: "needs_clarification",
      userMessage: intent.userMessage,
    };
  }

  const created = await createProjectFromPrompt({
    writer: input.writer,
    userId: input.user.id,
    prompt,
    source: "prompt",
    idempotencyKey: input.idempotencyKey ?? null,
    sessionId: input.idempotencyKey ?? null,
  });

  if (!created.ok) {
    return {
      ok: false,
      error: created.error,
      code: created.code,
      userMessage: created.userMessage,
    };
  }

  const projectId = created.projectId;
  const readable = await waitForProjectReadable(input.writer, input.user.id, projectId);
  if (!readable) {
    return {
      ok: false,
      error: "Project was created but is not visible yet. Try again in a moment.",
      code: "project_not_readable",
    };
  }

  const modelId =
    input.selectedModel?.trim() && input.selectedModel !== "automatic"
      ? input.selectedModel.trim()
      : DEFAULT_MODEL_ID;

  const conv = await ensureProjectConversation({
    writer: input.writer,
    user: input.user,
    projectId,
    title: prompt.slice(0, 60) || "New app",
    modelId,
    mode: "build",
  });

  if ("error" in conv) {
    return {
      ok: false,
      error: conv.error,
      code: conv.code ?? "conversation_error",
      userMessage: conv.hint,
    };
  }

  const operationId =
    input.idempotencyKey?.trim() ||
    `home:${input.user.id}:${projectId}:${Date.now()}`;

  let messageId: string | null = null;
  const { data: userMsg, error: msgErr } = await input.writer
    .from("messages")
    .insert({
      conversation_id: conv.id,
      user_id: input.user.id,
      role: "user",
      content: prompt,
      credits_used: 0,
      model_id: modelId,
      metadata: { operation_id: operationId, source: "home_start" } as never,
    })
    .select("id")
    .single();

  if (msgErr && process.env.NODE_ENV !== "production") {
    console.warn("[start-from-home] message insert:", msgErr.message);
  } else {
    messageId = userMsg?.id ?? null;
  }

  let jobId: string | null = null;
  if (input.strategy === "build_now") {
    const { data: bj, error: bjErr } = await input.writer
      .from("build_jobs")
      .insert({
        user_id: input.user.id,
        project_id: projectId,
        conversation_id: conv.id,
        status: "queued",
        started_at: new Date().toISOString(),
        prompt,
        result_summary: null,
        error_message: null,
        meta: {
          model_id: modelId,
          source: "home_start",
          strategy: input.strategy,
        } as Json,
      } as never)
      .select("id")
      .single();

    if (bjErr && process.env.NODE_ENV !== "production") {
      console.warn("[start-from-home] build_jobs insert:", bjErr.message);
    } else {
      jobId = bj?.id ?? null;
    }
  }

  const builderUrl = buildBuilderUrl({
    projectId,
    jobId,
    conversationId: conv.id,
    autostart: true,
    strategy: input.strategy,
    model: modelId !== DEFAULT_MODEL_ID ? modelId : null,
  });

  return {
    ok: true,
    intent: "build",
    projectId,
    conversationId: conv.id,
    jobId,
    builderUrl,
    messageId,
  };
}
