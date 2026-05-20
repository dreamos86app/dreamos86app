import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bootstrapProfileFromOAuth } from "@/lib/auth/profile-bootstrap";
import { calculateTokens } from "@/lib/credits/cost-engine";
import { hasAnyLlmProviderKey } from "@/lib/llm/env-keys";
import { loadProfileBillingRow } from "@/lib/supabase/load-profile-billing";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isPostgrestSchemaOrMissingTableError } from "@/lib/supabase/schema-errors";
import type { AiPreflightMode } from "@/lib/ai/preflight-types";

const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export type PreflightServerResult =
  | {
      ok: true;
      userId: string;
      projectId: string | null;
      conversationId: string | null;
      tokensRemaining: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      hint?: string;
    };

function slugFromTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "app";
}

function dbErrorPayload(
  table: string,
  err: { message?: string; code?: string } | null,
): Extract<PreflightServerResult, { ok: false }> {
  const msg = err?.message ?? "unknown database error";
  const schema = isPostgrestSchemaOrMissingTableError(msg);
  return {
    ok: false,
    error: schema
      ? `Database table or column missing: public.${table}`
      : `Database error on public.${table}`,
    code: schema ? "schema_error" : table === "projects" ? "project_error" : "conversation_error",
    hint: `${msg} — run Supabase migrations for public.${table} and reload the schema cache.`,
    status: schema ? 503 : 500,
  };
}

async function ensureConversation(
  writer: SupabaseClient,
  user: User,
  conversationId: string | undefined,
  title: string,
  modelId: string,
): Promise<{ id: string } | Extract<PreflightServerResult, { ok: false }>> {
  if (conversationId) {
    const { data, error } = await writer
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return dbErrorPayload("conversations", error);
    if (!data?.id) {
      return {
        ok: false,
        status: 404,
        error: "Conversation not found",
        code: "conversation_error",
        hint: "Start a new thread or pick an existing conversation.",
      };
    }
    return { id: data.id };
  }

  const { data, error } = await writer
    .from("conversations")
    .insert({
      user_id: user.id,
      title: title.slice(0, 80) || "New conversation",
      model_id: modelId,
    })
    .select("id")
    .single();

  if (error || !data?.id) return dbErrorPayload("conversations", error);
  return { id: data.id };
}

async function ensureProject(
  writer: SupabaseClient,
  user: User,
  projectId: string | undefined,
  prompt: string,
): Promise<{ id: string } | Extract<PreflightServerResult, { ok: false }>> {
  if (projectId) {
    const { data, error } = await writer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) return dbErrorPayload("projects", error);
    if (!data?.id) {
      return {
        ok: false,
        status: 404,
        error: "Project not found",
        code: "project_error",
        hint: "This app does not exist or you do not have access.",
      };
    }
    return { id: data.id };
  }

  const name = prompt.slice(0, 80) || "New app";
  const slug = `${slugFromTitle(name)}-${Date.now().toString(36)}`;
  const { data, error } = await writer
    .from("projects")
    .insert({
      owner_id: user.id,
      name,
      slug,
      status: "building",
      framework: "nextjs",
    } as never)
    .select("id")
    .single();

  if (error || !data?.id) return dbErrorPayload("projects", error);
  return { id: data.id };
}

export async function runAiPreflightServer(request: Request): Promise<PreflightServerResult> {
  if (!hasAnyLlmProviderKey()) {
    return {
      ok: false,
      status: 503,
      error: "AI provider is not configured on this server.",
      code: "llm_setup",
      hint:
        "Set at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY, then restart the server.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required",
      code: "unauthorized",
      hint: "Open /auth/login on the same origin as this tab.",
    };
  }

  let raw: {
    mode?: string;
    prompt?: string;
    projectId?: string;
    conversationId?: string;
    modelId?: string;
  };

  try {
    raw = await request.json();
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body", code: "invalid_body" };
  }

  const mode: AiPreflightMode =
    raw.mode === "build" ? "build" : raw.mode === "edit" ? "edit" : "discuss";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) {
    return { ok: false, status: 400, error: "Prompt is required", code: "empty_prompt" };
  }

  const modelId =
    typeof raw.modelId === "string" && raw.modelId.length > 0 ? raw.modelId : DEFAULT_MODEL_ID;
  const projectIdIn =
    typeof raw.projectId === "string" && raw.projectId.length > 0 ? raw.projectId : undefined;
  const conversationIdIn =
    typeof raw.conversationId === "string" && raw.conversationId.length > 0
      ? raw.conversationId
      : undefined;

  if (mode === "edit" && !projectIdIn) {
    return {
      ok: false,
      status: 400,
      error: "Edit mode requires an app project",
      code: "edit_no_app",
      hint: "Switch to Build to create an app, or open an existing project.",
    };
  }

  try {
    await bootstrapProfileFromOAuth(user, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "profile_bootstrap_failed";
    return {
      ok: false,
      status: 503,
      error: "Account profile unavailable",
      code: "profile_unavailable",
      hint: isPostgrestSchemaOrMissingTableError(msg)
        ? `public.profiles — ${msg}. Run Supabase migrations and reload schema.`
        : msg,
    };
  }

  const { row: billingRow, hint: billingHint } = await loadProfileBillingRow(supabase, user);
  if (!billingRow) {
    return {
      ok: false,
      status: 503,
      error: "Account profile unavailable",
      code: "profile_unavailable",
      hint:
        billingHint ??
        "Run Supabase migrations for public.profiles and set SUPABASE_SERVICE_ROLE_KEY for bootstrap.",
    };
  }

  const tokensNeeded = calculateTokens(modelId, mode);
  const balance = billingRow.credits_remaining;
  if (balance < tokensNeeded) {
    return {
      ok: false,
      status: 402,
      error: "Not enough credits for this request",
      code: "insufficient_tokens",
      hint: `Need ${tokensNeeded} credits; you have ${balance}.`,
    };
  }

  const admin = createServiceRoleClient();
  const writer = admin ?? supabase;

  let projectId: string | null = projectIdIn ?? null;
  let conversationId: string | null = conversationIdIn ?? null;

  if (mode === "build") {
    const proj = await ensureProject(writer, user, projectIdIn, prompt);
    if ("ok" in proj) return proj;
    projectId = proj.id;
  } else if (mode === "edit") {
    const proj = await ensureProject(writer, user, projectIdIn, prompt);
    if ("ok" in proj) return proj;
    projectId = proj.id;
  }

  const conv = await ensureConversation(
    writer,
    user,
    conversationId ?? undefined,
    prompt,
    modelId,
  );
  if ("ok" in conv) return conv;
  conversationId = conv.id;

  return {
    ok: true,
    userId: user.id,
    projectId,
    conversationId,
    tokensRemaining: balance,
  };
}
