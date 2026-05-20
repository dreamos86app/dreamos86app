"use client";

import { isSubmitDebugEnabled } from "@/lib/dev/submit-debug-enabled";

export type SubmitPipelineChannel = "create" | "chat";

export type PipelineStepLevel = "info" | "ok" | "warn" | "error";

export type PipelineStep = {
  id: string;
  at: number;
  level: PipelineStepLevel;
  message: string;
  detail?: string;
};

export type SubmitPipelineSnapshot = {
  channel: SubmitPipelineChannel;
  steps: PipelineStep[];
  clicked: boolean;
  submitted: boolean;
  preflight: string;
  chat: string;
  blocked: string;
  lastError: string | null;
};

const MAX_STEPS = 40;

function emptySnapshot(channel: SubmitPipelineChannel): SubmitPipelineSnapshot {
  return {
    channel,
    steps: [],
    clicked: false,
    submitted: false,
    preflight: "idle",
    chat: "idle",
    blocked: "no",
    lastError: null,
  };
}

const snapshots: Record<SubmitPipelineChannel, SubmitPipelineSnapshot> = {
  create: emptySnapshot("create"),
  chat: emptySnapshot("chat"),
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function isSubmitPipelineVisible(): boolean {
  if (typeof window === "undefined") return false;
  return isSubmitDebugEnabled();
}

export function subscribeSubmitPipeline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSubmitPipelineSnapshot(channel: SubmitPipelineChannel): SubmitPipelineSnapshot {
  return snapshots[channel];
}

export type PushTraceOptions = {
  level?: PipelineStepLevel;
  detail?: string;
  preflight?: string;
  chat?: string;
  blocked?: string;
  clicked?: boolean;
  submitted?: boolean;
  error?: string | null;
};

/** Always updates on-screen pipeline (localhost/dev). Also logs to console. */
export function pushSubmitTrace(
  channel: SubmitPipelineChannel,
  message: string,
  opts: PushTraceOptions = {},
) {
  const level = opts.level ?? "info";
  const prev = snapshots[channel];
  const step: PipelineStep = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    level,
    message,
    detail: opts.detail,
  };

  const lastError =
    opts.error !== undefined
      ? opts.error
      : level === "error"
        ? message
        : prev.lastError;

  snapshots[channel] = {
    channel,
    steps: [...prev.steps, step].slice(-MAX_STEPS),
    clicked: opts.clicked ?? prev.clicked,
    submitted: opts.submitted ?? prev.submitted,
    preflight: opts.preflight ?? prev.preflight,
    chat: opts.chat ?? prev.chat,
    blocked: opts.blocked ?? prev.blocked,
    lastError,
  };

  if (typeof console !== "undefined") {
    const tag = channel === "create" ? "create-pipeline" : "chat-pipeline";
    if (opts.detail) console.info(`[${tag}] ${message}`, opts.detail);
    else console.info(`[${tag}] ${message}`);
  }

  emit();
}

export function resetSubmitPipeline(channel: SubmitPipelineChannel) {
  snapshots[channel] = emptySnapshot(channel);
  emit();
}
