import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { bootstrapProfileFromOAuth } from "@/lib/auth/profile-bootstrap";
import { startProjectFromHome } from "@/lib/projects/start-from-home";
import type { BuildStrategy } from "@/lib/create/autostart-handoff";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  let prompt = "";
  let strategy: BuildStrategy = "build_now";
  let selectedModel: string | null = null;
  let idempotencyKey: string | null = null;

  try {
    const body = (await request.json()) as {
      prompt?: string;
      strategy?: string;
      selectedModel?: string | null;
      idempotencyKey?: string;
    };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (body.strategy === "plan_first" || body.strategy === "build_now") {
      strategy = body.strategy;
    }
    selectedModel =
      typeof body.selectedModel === "string" ? body.selectedModel.trim() : null;
    idempotencyKey =
      typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body", code: "invalid_body" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: "Prompt is required", code: "empty_prompt" },
      { status: 400 },
    );
  }

  try {
    await bootstrapProfileFromOAuth(user, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "profile_bootstrap_failed";
    return NextResponse.json({ ok: false, error: msg, code: "profile_bootstrap_failed" }, { status: 503 });
  }

  const writer = createServiceRoleClient() ?? supabase;
  const result = await startProjectFromHome({
    writer,
    user,
    prompt,
    strategy,
    selectedModel,
    idempotencyKey,
  });

  if (!result.ok) {
    const status =
      result.code === "needs_clarification" ? 422 : result.code === "project_not_readable" ? 503 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
