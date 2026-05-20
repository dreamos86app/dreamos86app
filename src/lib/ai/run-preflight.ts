"use client";

import type { AiPreflightMode, AiPreflightResponse } from "@/lib/ai/preflight-types";

export type RunAiPreflightParams = {
  mode: AiPreflightMode;
  prompt: string;
  projectId?: string | null;
  conversationId?: string | null;
  modelId?: string;
};

/**
 * Server-side bootstrap before /api/chat — profile, tokens, project, conversation.
 */
export async function runAiPreflight(params: RunAiPreflightParams): Promise<AiPreflightResponse> {
  try {
    const res = await fetch("/api/ai/preflight", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: params.mode,
        prompt: params.prompt,
        projectId: params.projectId ?? undefined,
        conversationId: params.conversationId ?? undefined,
        modelId: params.modelId,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      userId?: string;
      projectId?: string | null;
      conversationId?: string | null;
      tokensRemaining?: number;
      error?: string;
      code?: string;
      hint?: string;
    };

    if (res.ok && body.ok === true && body.userId) {
      return {
        ok: true,
        userId: body.userId,
        projectId: body.projectId ?? null,
        conversationId: body.conversationId ?? null,
        tokensRemaining:
          typeof body.tokensRemaining === "number" ? body.tokensRemaining : 0,
      };
    }

    return {
      ok: false,
      status: res.status,
      error: body.error ?? `Preflight failed (${res.status})`,
      code: body.code,
      hint: body.hint,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Could not reach preflight service",
      code: "network",
    };
  }
}
