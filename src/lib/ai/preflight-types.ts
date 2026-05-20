export type AiPreflightMode = "discuss" | "build" | "edit";

export type AiPreflightSuccess = {
  ok: true;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  tokensRemaining: number;
};

export type AiPreflightFailure = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  hint?: string;
};

export type AiPreflightResponse = AiPreflightSuccess | AiPreflightFailure;

export function isAiPreflightSuccess(r: AiPreflightResponse): r is AiPreflightSuccess {
  return r.ok === true;
}

/** Maps API error codes to debug-strip `blocked:*` labels. */
export function preflightBlockedLabel(code: string | undefined, status: number): string {
  if (code === "unauthorized") return "blocked:auth";
  if (code === "insufficient_tokens") return "blocked:tokens";
  if (code === "edit_no_app") return "blocked:edit-no-app";
  if (code === "profile_unavailable") return "blocked:profile";
  if (code === "llm_setup") return "blocked:provider";
  if (code === "project_error") return "blocked:project";
  if (code === "conversation_error") return "blocked:conversation";
  if (code === "schema_error") return "blocked:server";
  if (status >= 500) return "blocked:server";
  return "blocked:server";
}
