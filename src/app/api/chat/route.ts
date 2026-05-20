import { streamText, generateText, convertToModelMessages, type ModelMessage } from "ai";
import type { UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadMemory, formatMemoryForPrompt } from "@/lib/creation/memory";
import { buildSystemPrompt } from "@/lib/creation/system-prompt";
import { calculateTokens } from "@/lib/credits/cost-engine";
import type { Json } from "@/lib/supabase/types";
import { loadProfileBillingRow } from "@/lib/supabase/load-profile-billing";
import { parseFencedFiles } from "@/lib/creation/extract-fenced-code";
import {
  extractBuilderMetadata,
  slugifyAppName,
} from "@/lib/creation/parse-builder-metadata";
import { validateGeneratedBuild } from "@/lib/creation/validate-build-quality";
import { validateBuilderOutput } from "@/lib/builder/validate-builder-output";
import { appIconSvgDataUrl } from "@/lib/creation/app-icon-svg";
import { getAppUrl } from "@/lib/app-url";
import { allocatePublishedSubdomain } from "@/lib/publish/subdomain";
import { googleGenerativeApiKey, hasAnyLlmProviderKey } from "@/lib/llm/env-keys";
import { isAutomaticModelId } from "@/lib/ai/resolve-automatic-model";
import { routeModel, mapChatModeToTask } from "@/lib/ai/model-router";
import { chargeAiOperation } from "@/lib/credits/charge-ai-operation";
import { calculateCreditsToCharge } from "@/lib/credits/calculate-charge";
import { finalizeBuildSuccess, finalizeBuildFailed } from "@/lib/build/finalize-build";
import { runBuildQualityRepair } from "@/lib/build/quality-repair";
import { ensureProjectConversation } from "@/lib/projects/project-conversation";
import { loadProjectContextBlock, refineAppName } from "@/lib/projects/project-context";
import {
  hasRecentRunningBuildJob,
  hasSuccessfulChargeForOperation,
  hasUserMessageForOperation,
} from "@/lib/chat/server-idempotency";
import {
  classifyBuildIntent,
  shouldStartBuildPipeline,
} from "@/lib/ai/build-intent-classifier";
import { ensureUserProfileServer } from "@/lib/auth/ensure-user-profile-server";

const MODEL_ID_MAP: Record<string, string> = {
  "claude-opus-4-7": "claude-opus-4-5",
  "claude-opus-4-6": "claude-opus-4-5",
  "claude-sonnet-4-6": "claude-sonnet-4-5",
  "claude-haiku-4-5": "claude-haiku-4-5",
  "gpt-5-5": "gpt-4o",
  "gpt-5-4": "gpt-4o",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gemini-2-0-flash": "gemini-2.0-flash",
  "gemini-flash": "gemini-2.0-flash",
};

const PAID_DEFAULT_MODEL = "claude-sonnet-4-6";

const LLM_SETUP_ERROR = "AI provider is not configured on this server.";
const LLM_SETUP_HINT =
  "Add at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY to the server environment, then restart.";

/** Cheapest available discuss model based on which provider keys exist. */
function pickFreeDiscussModelId(): string {
  if (process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  if (googleGenerativeApiKey()) return "gemini-2.0-flash";
  if (process.env.ANTHROPIC_API_KEY) return "claude-haiku-4-5";
  return "gpt-4o-mini";
}

function resolveModel(modelId: string) {
  const resolved = MODEL_ID_MAP[modelId] ?? modelId;
  if (resolved.startsWith("gemini")) {
    if (!googleGenerativeApiKey()) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured on the server");
    }
    return google(resolved);
  }
  if (resolved.startsWith("claude")) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured on the server");
    }
    return anthropic(resolved);
  }
  if (resolved.startsWith("gpt")) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured on the server");
    }
    return openai(resolved);
  }
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  if (googleGenerativeApiKey()) return google("gemini-2.0-flash");
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5");
  throw new Error("No LLM API key configured (OpenAI, Google, or Anthropic)");
}

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last?.parts?.length) return "";
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function planIsFree(planId: string | null | undefined): boolean {
  if (!planId) return true;
  const p = planId.toLowerCase();
  return p === "free" || p === "starter";
}

function injectUserImages(messages: ModelMessage[], imageUrls: string[]): ModelMessage[] {
  if (imageUrls.length === 0) return messages;
  const idx = messages.findLastIndex((m) => m.role === "user");
  if (idx < 0) return messages;
  const cur = messages[idx];
  if (cur.role !== "user") return messages;

  const contentParts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: URL }
  > = [];

  if (typeof cur.content === "string") {
    contentParts.push({ type: "text", text: cur.content });
  } else if (Array.isArray(cur.content)) {
    for (const part of cur.content) {
      if (part.type === "text") contentParts.push(part);
      if (part.type === "image" && part.image instanceof URL) {
        contentParts.push({ type: "image", image: part.image });
      }
      if (part.type === "image" && typeof part.image === "string") {
        try {
          contentParts.push({ type: "image", image: new URL(part.image) });
        } catch {
          /* skip */
        }
      }
    }
  }

  for (const url of imageUrls) {
    try {
      contentParts.push({ type: "image", image: new URL(url) });
    } catch {
      /* skip */
    }
  }

  const next = [...messages];
  next[idx] = { role: "user", content: contentParts };
  return next;
}

function appendFileLinks(
  messages: ModelMessage[],
  files: { name: string; url: string }[],
): ModelMessage[] {
  if (files.length === 0) return messages;
  const idx = messages.findLastIndex((m) => m.role === "user");
  if (idx < 0) return messages;
  const cur = messages[idx];
  if (cur.role !== "user") return messages;

  const suffix = `\n\n(Attachments)\n${files.map((f) => `- [${f.name}](${f.url})`).join("\n")}`;
  const next = [...messages];

  if (typeof cur.content === "string") {
    next[idx] = { role: "user", content: cur.content + suffix };
    return next;
  }

  if (Array.isArray(cur.content)) {
    const hadText = cur.content.some((p) => p.type === "text");
    const out = cur.content.map((part) => {
      if (part.type === "text" && "text" in part && typeof part.text === "string") {
        return { ...part, text: part.text + suffix };
      }
      return part;
    });
    next[idx] = {
      role: "user",
      content: hadText ? out : [...out, { type: "text" as const, text: suffix.trim() }],
    };
  }

  return next;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[api/chat] POST");
  }
  const supabase = await createClient();
  const admin = createServiceRoleClient();
  const writer = admin ?? supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: {
    messages?: UIMessage[];
    modelId?: string;
    conversationId?: string;
    mode?: "discuss" | "edit" | "build";
    scope?: string | null;
    editTarget?: string | null;
    projectId?: string;
    attachmentIds?: unknown;
    operationId?: string;
    idempotencyKey?: string;
  };

  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const uiMessages = raw.messages ?? [];
  if (!Array.isArray(uiMessages) || uiMessages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  let conversationId =
    typeof raw.conversationId === "string" && raw.conversationId.length > 0
      ? raw.conversationId
      : undefined;

  const attachmentIds: string[] = Array.isArray(raw.attachmentIds)
    ? raw.attachmentIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  if (attachmentIds.length > 0 && !conversationId) {
    return NextResponse.json(
      { error: "conversationId required when sending attachments" },
      { status: 400 },
    );
  }

  const mode: "discuss" | "edit" | "build" =
    raw.mode === "edit" ? "edit" : raw.mode === "build" ? "build" : "discuss";
  const scope =
    typeof raw.editTarget === "string" && raw.editTarget.trim()
      ? raw.editTarget.trim()
      : typeof raw.scope === "string"
        ? raw.scope
        : null;
  const projectId =
    typeof raw.projectId === "string" && raw.projectId.length > 0 ? raw.projectId : undefined;

  const { row: billingRow, hint: billingHint } = await loadProfileBillingRow(supabase, user);
  if (!billingRow) {
    return NextResponse.json(
      {
        error: "Account profile unavailable",
        hint:
          billingHint ??
          "Run Supabase migrations for public.profiles, set SUPABASE_SERVICE_ROLE_KEY for bootstrap, then reload the schema.",
      },
      { status: 503 },
    );
  }
  if (billingHint && process.env.NODE_ENV !== "production") {
    console.warn("[chat] profile billing degraded:", billingHint);
  }

  await ensureUserProfileServer(user.id, user.email ?? null);

  const profileRow = billingRow;

  const userTextEarly = lastUserText(uiMessages);
  const buildIntent =
    mode === "build" && userTextEarly ? classifyBuildIntent(userTextEarly) : null;
  const startBuildPipeline = shouldStartBuildPipeline(mode, buildIntent);
  const chargeMode: "discuss" | "edit" | "build" =
    mode === "build" && !startBuildPipeline ? "discuss" : mode;

  if (buildIntent && process.env.NODE_ENV !== "production") {
    console.info("[build-intent]", {
      intent: buildIntent.intent,
      confidence: buildIntent.confidence,
      reason: buildIntent.reason,
      startBuildPipeline,
    });
  }

  const freePlan = planIsFree(profileRow.plan_id as string | undefined);
  const requestedModel =
    typeof raw.modelId === "string" && raw.modelId.length > 0 ? raw.modelId : undefined;
  const taskMode = mapChatModeToTask(mode);
  const routed = routeModel(taskMode, requestedModel);
  const modelId =
    freePlan && taskMode === "discuss"
      ? pickFreeDiscussModelId()
      : routed.modelId;
  const billedModelId = modelId;

  if (routed.missingEnv.length > 0 && !hasAnyLlmProviderKey()) {
    return NextResponse.json(
      {
        error: LLM_SETUP_ERROR,
        hint: LLM_SETUP_HINT,
        missingEnv: routed.missingEnv,
      },
      { status: 503 },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[ai-route]", {
      mode: taskMode,
      provider: routed.provider,
      modelId: billedModelId,
      isFallback: routed.isFallback,
      tier: routed.estimatedTier,
    });
  }

  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(uiMessages, {
      ignoreIncompleteToolCalls: true,
    });
  } catch {
    return NextResponse.json({ error: "Invalid messages payload" }, { status: 400 });
  }

  let attachmentRows: Array<{
    id: string;
    public_url: string;
    mime_type: string;
    file_name: string | null;
  }> = [];

  if (attachmentIds.length > 0) {
    const { data: attData, error: attErr } = await supabase
      .from("message_attachments")
      .select("id, public_url, mime_type, file_name")
      .eq("user_id", user.id)
      .in("id", attachmentIds);
    if (attErr) {
      return NextResponse.json({ error: "Could not verify attachments" }, { status: 400 });
    }
    attachmentRows = attData ?? [];
    if (attachmentRows.length !== attachmentIds.length) {
      return NextResponse.json({ error: "Invalid or stale attachment references" }, { status: 400 });
    }
  }

  const imageUrls = attachmentRows.filter((r) => r.mime_type.startsWith("image/")).map((r) => r.public_url);
  const fileLinks = attachmentRows
    .filter((r) => !r.mime_type.startsWith("image/"))
    .map((r) => ({ name: r.file_name ?? "file", url: r.public_url }));

  modelMessages = appendFileLinks(modelMessages, fileLinks);
  modelMessages = injectUserImages(modelMessages, imageUrls);

  const tokensNeeded = calculateTokens(modelId, chargeMode);
  const balance = profileRow.credits_remaining;

  if (balance < tokensNeeded) {
    return NextResponse.json(
      {
        error: "insufficient_tokens",
        tokens_remaining: balance,
        tokens_required: tokensNeeded,
      },
      { status: 402 },
    );
  }

  const userText = lastUserText(uiMessages);
  const userEmail = profileRow.email || user.email || "";

  const attachmentsJson: Json = attachmentRows.map((r) => ({
    id: r.id,
    url: r.public_url,
    mime: r.mime_type,
    name: r.file_name ?? "attachment",
  })) as unknown as Json;

  if (userText && !conversationId) {
    const conv = await ensureProjectConversation({
      writer,
      user,
      projectId,
      title: userText.slice(0, 60) || "New conversation",
      modelId,
      mode,
    });
    if ("error" in conv) {
      return NextResponse.json(
        { error: conv.error, hint: conv.hint ?? "Check Supabase migrations for conversations." },
        { status: conv.status },
      );
    }
    conversationId = conv.id;
  } else if (conversationId && projectId) {
    await ensureProjectConversation({
      writer,
      user,
      conversationId,
      projectId,
      title: userText?.slice(0, 60) ?? "Project",
      modelId,
      mode,
    });
  }

  const clientOpId =
    typeof raw.operationId === "string" && raw.operationId.length > 0
      ? raw.operationId
      : typeof raw.idempotencyKey === "string" && raw.idempotencyKey.length > 0
        ? raw.idempotencyKey
        : null;

  let opId =
    clientOpId ??
    `chat:${user.id}:${conversationId ?? "new"}:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let buildJobId: string | null = null;
  if (startBuildPipeline && projectId && userText) {
    const dupBuild = await hasRecentRunningBuildJob(writer, projectId, userText);
    if (!dupBuild) {
    await writer
      .from("projects")
      .update({ build_status: "building" } as never)
      .eq("id", projectId)
      .eq("owner_id", user.id);

    const { data: bj, error: bjErr } = await writer
      .from("build_jobs")
      .insert({
        user_id: user.id,
        project_id: projectId,
        conversation_id: conversationId ?? null,
        status: "running",
        started_at: new Date().toISOString(),
        prompt: userText,
        result_summary: null,
        error_message: null,
        meta: {
          model_id: modelId,
          intent: buildIntent?.intent,
          intent_confidence: buildIntent?.confidence,
          intent_reason: buildIntent?.reason,
        } as Json,
      } as never)
      .select("id")
      .single();
    buildJobId = bj?.id ?? null;
    if (buildJobId && !clientOpId) {
      opId = `build:${user.id}:${projectId}:${buildJobId}`;
    }
    if (bjErr && process.env.NODE_ENV !== "production") {
      console.warn("[chat] build_jobs insert:", bjErr.message);
    }
    }
  }

  let userMessageId: string | null = null;
  if (conversationId && userText) {
    const dupMsg = await hasUserMessageForOperation(writer, conversationId, opId);
    if (!dupMsg) {
    const { data: userMsg, error: insUserErr } = await writer
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: userText,
        credits_used: 0,
        model_id: modelId,
        attachments: attachmentsJson,
        metadata: { operation_id: opId, mode } as never,
      })
      .select("id")
      .single();

    if (insUserErr && process.env.NODE_ENV !== "production") {
      console.warn("[chat] user message insert:", insUserErr.message);
    }
    userMessageId = userMsg?.id ?? null;
    if (userMessageId && !clientOpId && conversationId) {
      opId = `ai:${user.id}:${conversationId}:${userMessageId}`;
    }

    if (userMessageId && attachmentIds.length > 0) {
      await writer
        .from("message_attachments")
        .update({ message_id: userMessageId, conversation_id: conversationId })
        .in("id", attachmentIds);
    }
    }
  }

  let memoryBlock = "";
  if (projectId) {
    const { entries } = await loadMemory(supabase, { projectId, limit: 30 });
    memoryBlock = formatMemoryForPrompt(entries);
    const projectCtx = await loadProjectContextBlock(writer, projectId, user.id);
    if (projectCtx) {
      memoryBlock = memoryBlock
        ? `${memoryBlock}\n\n---\nCurrent project state:\n${projectCtx}\n---`
        : `---\nCurrent project state:\n${projectCtx}\n---`;
    }
  }

  const systemPrompt = buildSystemPrompt({
    mode,
    scope,
    projectMemoryBlock: memoryBlock,
    hasProject: !!projectId,
  });

  let model;
  try {
    model = resolveModel(modelId);
  } catch (cfgErr) {
    const msg = cfgErr instanceof Error ? cfgErr.message : LLM_SETUP_ERROR;
    await writer.from("ai_usage_logs").insert({
      user_id: user.id,
      user_email: userEmail,
      model_id: modelId,
      mode,
      tokens_charged: 0,
      tokens_input: null,
      tokens_output: null,
      status: "error",
      error_message: msg,
      conversation_id: conversationId ?? null,
      operation_id: opId,
    });
    if (buildJobId) {
      await writer
        .from("build_jobs")
        .update({
          status: "failed",
          error_message: msg,
        })
        .eq("id", buildJobId);
    }
    const isSetup = !hasAnyLlmProviderKey();
    return NextResponse.json(
      {
        error: isSetup ? LLM_SETUP_ERROR : msg,
        hint: isSetup ? LLM_SETUP_HINT : undefined,
        code: isSetup ? "llm_setup" : undefined,
      },
      { status: 503 },
    );
  }

  try {
    const result = streamText({
      model,
      messages: modelMessages,
      system: systemPrompt,
      onFinish: async (event) => {
        const failed =
          event.finishReason === "error" ||
          event.finishReason === "content-filter";

        if (failed) {
          await writer.from("ai_usage_logs").insert({
            user_id: user.id,
            user_email: userEmail,
            model_id: modelId,
            mode,
            tokens_charged: 0,
            tokens_input: event.usage?.inputTokens ?? null,
            tokens_output: event.usage?.outputTokens ?? null,
            status: "error",
            error_message: `finish:${event.finishReason}`,
            conversation_id: conversationId ?? null,
            operation_id: opId,
          });
          if (buildJobId) {
            await writer
              .from("build_jobs")
              .update({
                status: "failed",
                error_message: `finish:${event.finishReason}`,
              })
              .eq("id", buildJobId);
          }
          return;
        }

        let buildQualityOk = true;
        let outputSaved = true;
        let buildFailureReason: string | null = null;

        if (conversationId && event.text) {
          const { error: asstErr } = await writer.from("messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: event.text,
            model_id: modelId,
            credits_used: 0,
            finish_reason: event.finishReason,
            tokens_input: event.usage?.inputTokens ?? null,
            tokens_output: event.usage?.outputTokens ?? null,
            metadata: { mode, scope, projectId, billing: "pending" } as never,
          });
          if (asstErr) {
            outputSaved = false;
            buildFailureReason = asstErr.message;
            if (process.env.NODE_ENV !== "production") {
              console.warn("[chat] assistant message insert:", asstErr.message);
            }
          }
        }

        let savedFileCount = 0;
        let savedAppName: string | null = null;
        let savedMeta: ReturnType<typeof extractBuilderMetadata> = null;
        let savedIconSvg: string | null = null;

        if (startBuildPipeline && projectId && event.text) {
          const files = parseFencedFiles(event.text);
          const meta = extractBuilderMetadata(event.text);
          savedMeta = meta;
          let appName =
            meta?.app?.name?.trim() ||
            event.text.match(/##\s*\[planning\][^\n]*\n+([^\n#][^\n]{0,80})/i)?.[1]?.trim() ||
            null;

          if (!appName && userText) {
            appName = userText
              .replace(/^(create|build|make)\s+(me\s+)?(a\s+)?/i, "")
              .split(/[.!?]/)[0]
              ?.trim()
              .slice(0, 48) || null;
          }
          if (!appName && files.length > 0) {
            appName = slugifyAppName(userText || "app").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          }
          if (appName) {
            appName = refineAppName(appName, userText || "");
          }

          if (files.length === 0) {
            buildQualityOk = false;
            buildFailureReason = "No project files generated";
          } else {
            if (!appName) {
              appName = refineAppName(userText || "Dream App", userText || "");
            }
            const quality = validateBuilderOutput(meta, files);
            const fileQuality = validateGeneratedBuild(files);
            const hasPreviewHtml = files.some(
              (f) => /preview\/index\.html$/i.test(f.path) && f.content.length > 150,
            );
            if (!quality.ok && process.env.NODE_ENV !== "production") {
              console.warn("[chat] builder meta quality:", quality.reasons);
            }
            if (!fileQuality.ok && !hasPreviewHtml && process.env.NODE_ENV !== "production") {
              console.warn("[chat] file quality:", fileQuality.reasons);
            }
            {
              const appSlug = meta?.app?.slug?.trim() || slugifyAppName(appName);
              const appDescription = meta?.app?.description?.trim() ?? null;
              const rows = files.map((f) => ({
                project_id: projectId,
                path: f.path,
                content: f.content,
                mime_type: "text/plain",
                size_bytes: Buffer.byteLength(f.content, "utf8"),
              }));
              const { error: afErr } = await writer.from("app_files").upsert(rows, {
                onConflict: "project_id,path",
              });
              if (afErr) {
                buildQualityOk = false;
                outputSaved = false;
                buildFailureReason = afErr.message;
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[chat] app_files upsert:", afErr.message);
                }
              } else {
                savedFileCount = files.length;
                buildQualityOk = true;
                savedAppName = appName;
                const svgIcon = appIconSvgDataUrl(appName, meta?.app?.category);
                savedIconSvg = svgIcon;
                const iconApiUrl = `${getAppUrl().replace(/\/$/, "")}/api/projects/${projectId}/icon`;
                await writer
                  .from("projects")
                  .update({ icon_url: iconApiUrl, app_icon_url: svgIcon } as never)
                  .eq("id", projectId)
                  .eq("owner_id", user.id);
                await finalizeBuildSuccess({
                  writer,
                  userId: user.id,
                  projectId,
                  buildJobId,
                  appName,
                  appSlug,
                  appDescription,
                  iconSvg: svgIcon,
                  meta,
                  fileCount: savedFileCount,
                  creditsCharged: 0,
                  charged: false,
                });
                await allocatePublishedSubdomain(writer, projectId, user.id);

                if (!fileQuality.ok && buildJobId) {
                  const repair = await runBuildQualityRepair({
                    writer,
                    projectId,
                    buildJobId,
                    userId: user.id,
                    files: files.map((f) => ({ path: f.path, content: f.content })),
                    userPrompt: userText,
                    generate: async (repairPrompt) => {
                      const { text } = await generateText({
                        model: resolveModel(billedModelId),
                        system: `${systemPrompt}\n\nRepair pass: fix quality issues only. Return fenced files.`,
                        prompt: repairPrompt,
                      });
                      return text;
                    },
                  });
                  if (repair.repaired) {
                    savedFileCount = repair.fileCount;
                    buildQualityOk = true;
                    buildFailureReason = null;
                  } else if (repair.attempts > 0) {
                    buildQualityOk = false;
                    buildFailureReason =
                      repair.reasons.join("; ") || "Quality repair could not fix all issues";
                  }
                }
              }
            }
          }
        }

        const shouldCharge =
          outputSaved &&
          Boolean(event.text?.trim()) &&
          (chargeMode !== "build" || savedFileCount > 0);

        let charged = false;
        let chargeError: string | null = null;

        const alreadyCharged = await hasSuccessfulChargeForOperation(writer, user.id, opId);

        if (shouldCharge && !alreadyCharged) {
          const chargeCalc = calculateCreditsToCharge({
            modelId: billedModelId,
            mode: chargeMode,
            inputTokens: event.usage?.inputTokens ?? null,
            outputTokens: event.usage?.outputTokens ?? null,
            fileCount: savedFileCount,
          });
          const creditsToCharge = chargeCalc.creditsToCharge;

          console.info("[credits] charge start", {
            operation_id: opId,
            provider: routed.provider,
            model: billedModelId,
            mode: chargeMode,
            credits: creditsToCharge,
          });

          const charge = await chargeAiOperation(writer, {
            userId: user.id,
            userEmail,
            amount: creditsToCharge,
            modelId: billedModelId,
            mode: chargeMode,
            operationId: opId,
            conversationId,
            projectId,
            buildJobId,
            providerCostUsd: chargeCalc.estimatedProviderCostUsd,
            tokensInput: event.usage?.inputTokens ?? null,
            tokensOutput: event.usage?.outputTokens ?? null,
            provider: routed.provider,
            routeReason: buildIntent?.reason ?? routed.routeReason ?? null,
          });
          charged = charge.charged;
          chargeError = charge.error ?? null;
          if (charge.charged) {
            console.info("[credits] charge ok", { operation_id: opId, remaining: charge.remaining });
          } else if (charge.idempotent) {
            console.info("[credits] charge skipped idempotent", { operation_id: opId });
          } else {
            console.warn("[credits] charge failed", { operation_id: opId, error: chargeError });
          }

          if (charged && mode === "build" && buildJobId && projectId && savedFileCount > 0) {
            await writer
              .from("build_jobs")
              .update({ credits_charged: creditsToCharge } as never)
              .eq("id", buildJobId);
            if (savedAppName) {
              await finalizeBuildSuccess({
                writer,
                userId: user.id,
                projectId,
                buildJobId,
                appName: savedAppName,
                appSlug: savedMeta?.app?.slug?.trim() ?? null,
                appDescription: savedMeta?.app?.description?.trim() ?? null,
                iconSvg: savedIconSvg,
                meta: savedMeta,
                fileCount: savedFileCount,
                creditsCharged: creditsToCharge,
                charged: true,
              });
            }
          }

          if (charged && conversationId) {
            const { data: lastAsst } = await writer
              .from("messages")
              .select("id")
              .eq("conversation_id", conversationId)
              .eq("role", "assistant")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (lastAsst?.id) {
              await writer.from("messages").update({ credits_used: creditsToCharge }).eq("id", lastAsst.id);
            }
          } else if (!charged && process.env.NODE_ENV !== "production") {
            console.warn("[chat] charge after save:", chargeError);
          }
        } else if (!alreadyCharged && outputSaved && event.text?.trim()) {
          const skipReason = buildFailureReason
            ? buildFailureReason
            : mode === "build" && savedFileCount === 0
              ? "Build output not saved — no credits charged"
              : "No charge — skipped";
          if (skipReason.includes("not saved") || skipReason.includes("Build output")) {
            await writer.from("ai_usage_logs").insert({
              user_id: user.id,
              user_email: userEmail,
              model_id: billedModelId,
              mode: chargeMode,
              tokens_charged: 0,
              status: "skipped",
              error_message: skipReason,
              conversation_id: conversationId ?? null,
              operation_id: opId,
              project_id: projectId ?? null,
            } as never);
          }
        }

        if (buildJobId && mode === "build" && !buildQualityOk) {
          await finalizeBuildFailed({
            writer,
            buildJobId,
            projectId: projectId ?? undefined,
            userId: user.id,
            errorMessage:
              buildFailureReason ??
              chargeError ??
              "Build did not meet quality requirements.",
          });
        }
      },
    });

    const response = result.toUIMessageStreamResponse();
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("X-DreamOS-Mode", taskMode);
      response.headers.set("X-DreamOS-Model", billedModelId);
      response.headers.set("X-DreamOS-Provider", routed.provider);
      response.headers.set("X-DreamOS-Credits-Estimate", String(tokensNeeded));
    }
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Model unavailable";
    await writer.from("ai_usage_logs").insert({
      user_id: user.id,
      user_email: userEmail,
      model_id: modelId,
      mode,
      tokens_charged: 0,
      tokens_input: null,
      tokens_output: null,
      status: "error",
      error_message: msg,
      conversation_id: conversationId ?? null,
      operation_id: opId,
    });
    if (buildJobId) {
      await writer
        .from("build_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", buildJobId);
    }
    return NextResponse.json({ error: msg, hint: LLM_SETUP_HINT }, { status: 503 });
  }
}
