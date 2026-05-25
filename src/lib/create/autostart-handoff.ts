/** Session handoff for home → /create autostart (not billing/project truth). */

import { pushRuntimeDiagnostic } from "@/lib/dev/runtime-diagnostics";

export const PENDING_PROMPT_KEY = "dreamos86.pendingPrompt";
const LEGACY_KEY = "dreamos:create-autostart";
const DUPLICATE_PREFIX = "dreamos86.promptDup:";
const SUBMITTED_OP_PREFIX = "dreamos86.submittedOp:";
const AUTOSTART_DONE_PREFIX = "dreamos86.autostartDone:";
const CONSUMED_PROMPT_PREFIX = "dreamos86.consumedPrompt:";
const DUPLICATE_WINDOW_MS = 2_000;
const CONSUMED_PROMPT_TTL_MS = 10 * 60_000;

export type BuildStrategy = "plan_first" | "build_now";

export type PendingPrompt = {
  id: string;
  text: string;
  mode: "discuss" | "edit" | "build";
  createdAt: number;
  consumed: boolean;
  buildStrategy?: BuildStrategy;
  modelId?: string;
};

export type AutostartHandoff = PendingPrompt & {
  idempotencyKey: string;
};

function newPromptId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `hp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Read session handoff without consuming (for autostart when prompt is not in the URL). */
export function peekPendingAutostartHandoff(): PendingPrompt | null {
  const pending = readPending();
  if (!pending || pending.consumed) return null;
  return pending;
}

function readPending(): PendingPrompt | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw =
      sessionStorage.getItem(PENDING_PROMPT_KEY) ?? sessionStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPrompt> & {
      prompt?: string;
      idempotencyKey?: string;
    };
    const text = (parsed.text ?? parsed.prompt ?? "").trim();
    if (!text) return null;
    const id = parsed.id ?? parsed.idempotencyKey ?? newPromptId();
    return {
      id,
      text,
      mode: parsed.mode === "edit" || parsed.mode === "discuss" ? parsed.mode : "build",
      createdAt: parsed.createdAt ?? Date.now(),
      consumed: Boolean(parsed.consumed),
      buildStrategy:
        parsed.buildStrategy === "build_now" || parsed.buildStrategy === "plan_first"
          ? parsed.buildStrategy
          : undefined,
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : undefined,
    };
  } catch {
    return null;
  }
}

function writePending(payload: PendingPrompt): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(payload));
  sessionStorage.removeItem(LEGACY_KEY);
}

function normalizeKey(text: string, mode: string, projectId?: string | null): string {
  const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
  return `${mode}:${projectId ?? "none"}:${norm}`;
}

/** Client duplicate guard — same text + mode + project within 3s. */
export function shouldSkipDuplicateClientSubmit(
  text: string,
  mode: string,
  projectId?: string | null,
): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const key = normalizeKey(text, mode, projectId);
  const now = Date.now();
  const prevRaw = sessionStorage.getItem(`${DUPLICATE_PREFIX}${key}`);
  if (prevRaw) {
    const prevAt = Number(prevRaw);
    if (!Number.isNaN(prevAt) && now - prevAt < DUPLICATE_WINDOW_MS) {
      pushRuntimeDiagnostic("prompt_submit_skipped_duplicate", { mode, projectId, key });
      return true;
    }
  }
  sessionStorage.setItem(`${DUPLICATE_PREFIX}${key}`, String(now));
  return false;
}

export function storeAutostartHandoff(
  prompt: string,
  mode: PendingPrompt["mode"],
  extras?: { buildStrategy?: BuildStrategy; modelId?: string },
): string {
  const existing = readPending();
  if (existing && !existing.consumed && existing.text === prompt.trim()) {
    return existing.id;
  }

  const id = newPromptId();
  const payload: PendingPrompt = {
    id,
    text: prompt.trim(),
    mode,
    createdAt: Date.now(),
    consumed: false,
    buildStrategy: extras?.buildStrategy,
    modelId: extras?.modelId,
  };
  writePending(payload);
  return id;
}

/** URL ?prompt=&autostart=1 → single pending row (does not consume). */
export function seedPendingFromUrl(
  prompt: string,
  mode: PendingPrompt["mode"],
): PendingPrompt | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  const existing = readPending();
  if (existing && !existing.consumed) {
    if (existing.text === trimmed) return existing;
    return existing;
  }
  const payload: PendingPrompt = {
    id: newPromptId(),
    text: trimmed,
    mode,
    createdAt: Date.now(),
    consumed: false,
  };
  writePending(payload);
  return payload;
}

/**
 * Consume exactly once — marks `consumed: true` in storage before returning.
 * Prefers session pending over bare URL when both exist (newer id wins if both fresh).
 */
export function consumeAutostartHandoff(
  promptFromUrl: string,
  modeFromUrl: PendingPrompt["mode"],
): AutostartHandoff | null {
  const urlText = promptFromUrl.trim();
  const pending = readPending();

  let chosen: PendingPrompt | null = null;

  if (pending && !pending.consumed) {
    if (!urlText || pending.text === urlText || Date.now() - pending.createdAt < 10 * 60_000) {
      chosen = pending;
    }
  }

  if (!chosen && urlText) {
    chosen = {
      id: newPromptId(),
      text: urlText,
      mode: modeFromUrl,
      createdAt: Date.now(),
      consumed: false,
    };
  }

  if (!chosen) return null;

  if (chosen.consumed && wasOperationSubmitted(chosen.id)) {
    pushRuntimeDiagnostic("prompt_submit_skipped_duplicate", {
      reason: "already_submitted",
      id: chosen.id,
    });
    return null;
  }

  if (chosen.consumed && !wasOperationSubmitted(chosen.id)) {
    pushRuntimeDiagnostic("handoff_consumed", { id: chosen.id, recovered: true });
    chosen = { ...chosen, consumed: false };
  }

  if (wasOperationSubmitted(chosen.id)) {
    pushRuntimeDiagnostic("prompt_submit_skipped_duplicate", {
      reason: "already_submitted",
      id: chosen.id,
    });
    return null;
  }

  markAutostartDone(chosen.id);

  const marked: PendingPrompt = { ...chosen, consumed: true };
  writePending(marked);
  pushRuntimeDiagnostic("prompt_submit_consumed_once", {
    id: marked.id,
    mode: marked.mode,
  });
  pushRuntimeDiagnostic("handoff_consumed", {
    id: marked.id,
    mode: marked.mode,
    textLen: marked.text.length,
  });

  return {
    ...marked,
    idempotencyKey: marked.id,
  };
}

/** Prevent refresh / StrictMode from resubmitting the same operation. */
function persistKey(key: string, value: string): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function hasPersistedKey(key: string): boolean {
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key) != null) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

export function markPromptIdConsumed(promptId: string): void {
  persistKey(`${CONSUMED_PROMPT_PREFIX}${promptId}`, String(Date.now()));
}

export function wasPromptIdConsumed(promptId: string): boolean {
  return hasPersistedKey(`${CONSUMED_PROMPT_PREFIX}${promptId}`);
}

export function markOperationSubmitted(operationId: string): void {
  persistKey(`${SUBMITTED_OP_PREFIX}${operationId}`, String(Date.now()));
  markPromptIdConsumed(operationId);
}

export function clearOperationSubmitted(operationId: string): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(`${SUBMITTED_OP_PREFIX}${operationId}`);
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`${SUBMITTED_OP_PREFIX}${operationId}`);
    }
  } catch {
    /* quota / private mode */
  }
}

export function wasOperationSubmitted(operationId: string): boolean {
  return hasPersistedKey(`${SUBMITTED_OP_PREFIX}${operationId}`);
}

export function clearAutostartDone(handoffId: string): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(`${AUTOSTART_DONE_PREFIX}${handoffId}`);
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`${AUTOSTART_DONE_PREFIX}${handoffId}`);
    }
  } catch {
    /* quota / private mode */
  }
}

export function markAutostartDone(handoffId: string): void {
  persistKey(`${AUTOSTART_DONE_PREFIX}${handoffId}`, "1");
}

export function wasAutostartDone(handoffId: string): boolean {
  return hasPersistedKey(`${AUTOSTART_DONE_PREFIX}${handoffId}`);
}

export function clearPendingPromptStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PENDING_PROMPT_KEY);
  sessionStorage.removeItem(LEGACY_KEY);
}

/** @deprecated alias */
export function storePendingPrompt(prompt: string, mode: PendingPrompt["mode"]): string {
  return storeAutostartHandoff(prompt, mode);
}
