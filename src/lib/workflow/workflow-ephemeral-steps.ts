import type { AgentWorkflowEvent } from "@/lib/build/workflow-stream-types";

export const EPHEMERAL_BUILD_STEPS: readonly { title: string; stableKey: string; ms: number }[] = [
  { title: "Reading your request", stableKey: "ephemeral:read", ms: 500 },
  { title: "Identifying app type", stableKey: "ephemeral:type", ms: 600 },
  { title: "Mapping core screens", stableKey: "ephemeral:screens", ms: 700 },
  { title: "Preparing project structure", stableKey: "ephemeral:structure", ms: 800 },
  { title: "Starting file generation", stableKey: "ephemeral:files", ms: 900 },
] as const;

export function buildEphemeralWorkflowEvents(
  startedAtMs: number,
  nowMs: number,
  openerText?: string,
): AgentWorkflowEvent[] {
  const elapsed = nowMs - startedAtMs;
  const events: AgentWorkflowEvent[] = [];
  const at = new Date(nowMs).toISOString();

  if (openerText) {
    events.push({
      id: `ephemeral-opener-${startedAtMs}`,
      category: "assistant_message",
      title: openerText,
      status: "done",
      at,
      stableKey: "ephemeral:opener",
      metadata: { ephemeral: true },
    });
  }

  let cumulative = 0;
  for (const step of EPHEMERAL_BUILD_STEPS) {
    cumulative += step.ms;
    if (elapsed < cumulative - 200) break;
    events.push({
      id: `ephemeral-${step.stableKey}`,
      category: "task_started",
      title: step.title,
      status: elapsed >= cumulative ? "done" : "active",
      at,
      stableKey: step.stableKey,
      metadata: { ephemeral: true },
    });
  }

  const last = events[events.length - 1];
  if (last && last.status === "done" && elapsed < 2500) {
    events.push({
      id: `ephemeral-wait-${startedAtMs}`,
      category: "task_started",
      title: "Connecting to build",
      status: "active",
      at,
      stableKey: "ephemeral:wait",
      metadata: { ephemeral: true },
    });
  }

  return events;
}

/** Merge server timeline over ephemeral rows without duplicate titles. */
export function mergeEphemeralWithServerEvents(
  ephemeral: AgentWorkflowEvent[],
  server: AgentWorkflowEvent[],
): AgentWorkflowEvent[] {
  if (server.length === 0) return ephemeral;
  const serverTitles = new Set(server.map((e) => e.title.toLowerCase()));
  const keptEphemeral = ephemeral.filter(
    (e) =>
      e.category === "assistant_message" ||
      !serverTitles.has(e.title.toLowerCase()),
  );
  return [...keptEphemeral.filter((e) => e.category === "assistant_message"), ...server];
}
