/** Session handoff for home → /create autostart (not billing/project truth). */

export const PENDING_PROMPT_KEY = "dreamos.pendingPrompt";
const LEGACY_KEY = "dreamos:create-autostart";
const CONSUMED_PREFIX = "dreamos.pendingPrompt.consumed:";

export type AutostartHandoff = {
  id: string;
  prompt: string;
  mode: "discuss" | "edit" | "build";
  idempotencyKey: string;
  createdAt: number;
};

function newPromptId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `hp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function storeAutostartHandoff(prompt: string, mode: AutostartHandoff["mode"]): string {
  const id = newPromptId();
  const idempotencyKey = id;
  const payload: AutostartHandoff = {
    id,
    prompt: prompt.trim(),
    mode,
    idempotencyKey,
    createdAt: Date.now(),
  };
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(payload));
    sessionStorage.removeItem(LEGACY_KEY);
  }
  return idempotencyKey;
}

function markConsumed(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${CONSUMED_PREFIX}${id}`, "1");
}

function wasConsumed(id: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(`${CONSUMED_PREFIX}${id}`) === "1";
}

export function consumeAutostartHandoff(
  promptFromUrl: string,
  modeFromUrl: AutostartHandoff["mode"],
): AutostartHandoff | null {
  const trimmed = promptFromUrl.trim();
  if (!trimmed) return null;

  if (typeof sessionStorage !== "undefined") {
    try {
      const raw =
        sessionStorage.getItem(PENDING_PROMPT_KEY) ?? sessionStorage.getItem(LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AutostartHandoff & { id?: string };
        const id = parsed.id ?? parsed.idempotencyKey;
        if (
          parsed.prompt === trimmed &&
          Date.now() - parsed.createdAt < 10 * 60_000 &&
          !wasConsumed(id)
        ) {
          sessionStorage.removeItem(PENDING_PROMPT_KEY);
          sessionStorage.removeItem(LEGACY_KEY);
          markConsumed(id);
          return {
            id,
            prompt: parsed.prompt,
            mode: parsed.mode ?? modeFromUrl,
            idempotencyKey: parsed.idempotencyKey ?? id,
            createdAt: parsed.createdAt,
          };
        }
      }
    } catch {
      /* ignore */
    }

    const fallbackId = `as_url_${hashPrompt(trimmed)}`;
    if (wasConsumed(fallbackId)) return null;
    markConsumed(fallbackId);
  }

  const id = newPromptId();
  return {
    id,
    prompt: trimmed,
    mode: modeFromUrl,
    idempotencyKey: id,
    createdAt: Date.now(),
  };
}

function hashPrompt(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
