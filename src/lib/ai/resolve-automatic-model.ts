import { hasAnyLlmProviderKey, googleGenerativeApiKey } from "@/lib/llm/env-keys";

const AUTOMATIC_ALIASES = new Set(["automatic", "auto", "default"]);

export function isAutomaticModelId(modelId: string | undefined | null): boolean {
  if (!modelId) return true;
  return AUTOMATIC_ALIASES.has(modelId.trim().toLowerCase());
}

/**
 * Picks the highest-quality model available on the server for this request type.
 * Paid users only — free tier uses pickFreeDiscussModelId in chat route.
 */
export function resolveAutomaticModelId(
  mode: "discuss" | "edit" | "build",
): string {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasGoogle = Boolean(googleGenerativeApiKey());

  if (mode === "build") {
    if (hasAnthropic) return "claude-sonnet-4-6";
    if (hasOpenai) return "gpt-4o";
    if (hasGoogle) return "gemini-2.0-flash";
    return "claude-sonnet-4-6";
  }

  if (mode === "edit") {
    if (hasAnthropic) return "claude-sonnet-4-6";
    if (hasOpenai) return "gpt-4o";
    if (hasGoogle) return "gemini-2.0-flash";
    return "claude-sonnet-4-6";
  }

  // discuss — strong but efficient
  if (hasAnthropic) return "claude-sonnet-4-6";
  if (hasOpenai) return "gpt-4o";
  if (hasGoogle) return "gemini-2.0-flash";
  return "gpt-4o-mini";
}

export function assertLlmConfigured(): void {
  if (!hasAnyLlmProviderKey()) {
    throw new Error("No LLM API key configured");
  }
}
