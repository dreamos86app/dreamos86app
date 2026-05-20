import { streamText, convertToModelMessages, type ModelMessage } from "ai";
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
import { appIconSvgDataUrl } from "@/lib/creation/app-icon-svg";
import { getAppUrl } from "@/lib/app-url";
import { allocatePublishedSubdomain } from "@/lib/publish/subdomain";
import { googleGenerativeApiKey, hasAnyLlmProviderKey } from "@/lib/llm/env-keys";
import {
  isAutomaticModelId,
  resolveAutomaticModelId,
} from "@/lib/ai/resolve-automatic-model";
import { estimateProviderCostUsd } from "@/lib/credits/usage-cost";

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
    projectId?: string;
    attachmentIds?: unknown;
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
  const scope = typeof raw.scope === "string" ? raw.scope : null;
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

  const profileRow = billingRow;

  const freePlan = planIsFree(profileRow.plan_id as string | undefined);
  const requestedModel =
    typeof raw.modelId === "string" && raw.modelId.length > 0 ? raw.modelId : undefined;
  const modelId = freePlan
    ? pickFreeDiscussModelId()
    : isAutomaticModelId(requestedModel)
      ? resolveAutomaticModelId(mode)
      : requestedModel ?? resolveAutomaticModelId(mode);
  const billedModelId = modelId;

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

  const tokensNeeded = calculateTokens(modelId, mode);
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
    const title = userText.slice(0, 60) || "New conversation";
    const { data: conv, error: convErr } = await writer
      .from("conversations")
      .insert({
        user_id: user.id,
        title,
        model_id: modelId,
      })
      .select("id")
      .single();
    if (convErr || !conv?.id) {
      return NextResponse.json(
        {
          error: "Could not create conversation",
          hint: convErr?.message ?? "Check Supabase migrations and RLS for conversations.",
        },
        { status: 500 },
      );
    }
    conversationId = conv.id;
  }

  let buildJobId: string | null = null;
  if (mode === "build" && projectId && userText) {
    const { data: bj, error: bjErr } = await writer
      .from("build_jobs")
      .insert({
        user_id: user.id,
        project_id: projectId,
        conversation_id: conversationId ?? null,
        status: "running",
        prompt: userText,
        result_summary: null,
        error_message: null,
        meta: { model_id: modelId } as Json,
      } as never)
      .select("id")
      .single();
    buildJobId = bj?.id ?? null;
    if (bjErr && process.env.NODE_ENV !== "production") {
      console.warn("[chat] build_jobs insert:", bjErr.message);
    }
  }

  let userMessageId: string | null = null;
  if (conversationId && userText) {
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
      })
      .select("id")
      .single();

    if (insUserErr && process.env.NODE_ENV !== "production") {
      console.warn("[chat] user message insert:", insUserErr.message);
    }
    userMessageId = userMsg?.id ?? null;

    if (userMessageId && attachmentIds.length > 0) {
      await writer
        .from("message_attachments")
        .update({ message_id: userMessageId, conversation_id: conversationId })
        .in("id", attachmentIds);
    }
  }

  let memoryBlock = "";
  if (projectId) {
    const { entries } = await loadMemory(supabase, { projectId, limit: 30 });
    memoryBlock = formatMemoryForPrompt(entries);
  }

  const systemPrompt = buildSystemPrompt({
    mode,
    scope,
    projectMemoryBlock: memoryBlock,
    hasProject: !!projectId,
  });

  const opId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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

        const providerCostUsd = estimateProviderCostUsd(
          billedModelId,
          mode,
          event.usage?.inputTokens ?? null,
          event.usage?.outputTokens ?? null,
        );

        const { data: creditResultRaw } = await writer.rpc("charge_tokens", {
          p_user_id: user.id,
          p_amount: tokensNeeded,
          p_reason: `AI ${mode}`,
          p_idempotency_key: opId,
          p_metadata: {
            model_id: billedModelId,
            mode,
            conversation_id: conversationId,
            operation_id: opId,
            provider_cost_usd: providerCostUsd,
            automatic: isAutomaticModelId(requestedModel),
          },
        });
        const creditResult = creditResultRaw as
          | { success?: boolean; error?: string | null; idempotent?: boolean }
          | null
          | undefined;
        const charged = Boolean(creditResult?.success);
        let buildQualityOk = true;

        if (creditResult && !creditResult.success && process.env.NODE_ENV !== "production") {
          console.warn("[chat] charge_tokens after stream:", creditResult.error);
        }

        await writer.from("ai_usage_logs").insert({
          user_id: user.id,
          user_email: userEmail,
          model_id: billedModelId,
          mode,
          tokens_charged: charged ? tokensNeeded : 0,
          tokens_input: event.usage?.inputTokens ?? null,
          tokens_output: event.usage?.outputTokens ?? null,
          status: charged ? "success" : "error",
          error_message: charged ? null : (creditResult?.error ?? "Token charge failed"),
          conversation_id: conversationId ?? null,
          operation_id: opId,
        });

        if (!charged && buildJobId) {
          await writer
            .from("build_jobs")
            .update({
              status: "failed",
              error_message:
                creditResult?.error ??
                "Token charge failed — generated files were not saved.",
            })
            .eq("id", buildJobId);
        }

        if (conversationId && event.text) {
          const { error: asstErr } = await writer.from("messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: event.text,
            model_id: modelId,
            credits_used: charged ? tokensNeeded : 0,
            finish_reason: event.finishReason,
            tokens_input: event.usage?.inputTokens ?? null,
            tokens_output: event.usage?.outputTokens ?? null,
            metadata: { mode, scope, projectId, billing: charged ? "charged" : "failed" } as never,
          });
          if (asstErr && process.env.NODE_ENV !== "production") {
            console.warn("[chat] assistant message insert:", asstErr.message);
          }
        }

        if (charged && mode === "build" && projectId && event.text) {
          const files = parseFencedFiles(event.text);
          const quality = validateGeneratedBuild(files);
          buildQualityOk = quality.ok;
          const meta = extractBuilderMetadata(event.text);
          const appName =
            meta?.app?.name?.trim() ||
            event.text.match(/##\s*\[planning\][^\n]*\n+([^\n#][^\n]{0,80})/i)?.[1]?.trim() ||
            null;
          const appSlug = meta?.app?.slug?.trim() || (appName ? slugifyAppName(appName) : null);
          const appDescription = meta?.app?.description?.trim() ?? null;

          if (files.length > 0) {
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
            if (afErr && process.env.NODE_ENV !== "production") {
              console.warn("[chat] app_files upsert:", afErr.message);
            }
            if (!afErr) {
              const iconApiUrl = `${getAppUrl().replace(/\/$/, "")}/api/projects/${projectId}/icon`;
              const svgIcon = appName ? appIconSvgDataUrl(appName, meta?.app?.category) : null;
              const { data: curProj } = await writer
                .from("projects")
                .select("name, slug, metadata")
                .eq("id", projectId)
                .maybeSingle();
              const curName = curProj?.name?.trim() ?? "";
              const shouldRename =
                Boolean(appName) && (!curName || /^new app$/i.test(curName) || /^new build$/i.test(curName));
              const prevMeta =
                curProj?.metadata && typeof curProj.metadata === "object" && !Array.isArray(curProj.metadata)
                  ? (curProj.metadata as Record<string, unknown>)
                  : {};
              const buildMeta = {
                ...prevMeta,
                builder: {
                  pages: meta?.pages ?? [],
                  entities: meta?.entities ?? [],
                  quality,
                  summary: meta?.summary ?? null,
                  updated_at: new Date().toISOString(),
                },
              };
              await writer
                .from("projects")
                .update(
                  {
                    icon_url: iconApiUrl,
                    app_icon_url: svgIcon,
                    status: quality.ok ? "draft" : "building",
                    build_status: quality.ok ? "ready" : "failed",
                    ...(shouldRename && appName ? { name: appName.slice(0, 80) } : {}),
                    ...(appSlug && shouldRename ? { slug: appSlug.slice(0, 48) } : {}),
                    ...(appDescription ? { description: appDescription.slice(0, 500) } : {}),
                    metadata: buildMeta as Json,
                  } as never,
                )
                .eq("id", projectId)
                .eq("owner_id", user.id);
              await allocatePublishedSubdomain(writer, projectId, user.id);

              if (!quality.ok && buildJobId) {
                await writer
                  .from("build_jobs")
                  .update({
                    status: "failed",
                    error_message: `Quality check: ${quality.reasons.join("; ")}`,
                  })
                  .eq("id", buildJobId);
              }
            }
          }

          if (charged && opId) {
            const { error: ceErr } = await writer.from("credit_events").insert({
              user_id: user.id,
              operation_id: opId,
              model_id: modelId,
              credits_consumed: tokensNeeded,
              event_type: "generation",
              conversation_id: conversationId ?? null,
            } as never);
            if (ceErr && process.env.NODE_ENV !== "production") {
              console.warn("[chat] credit_events insert:", ceErr.message);
            }
          }
        }

        if (buildJobId && charged && buildQualityOk) {
          await writer
            .from("build_jobs")
            .update({
              status: "succeeded",
              result_summary: event.text.slice(0, 600),
              error_message: null,
            })
            .eq("id", buildJobId);
        }
      },
    });

    return result.toUIMessageStreamResponse();
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
