import type { BuildJobEventRow, BuildJobEventType } from "@/lib/build/build-job-events";
import type {
  AgentWorkflowActiveState,
  AgentWorkflowCategory,
  AgentWorkflowEvent,
  AgentWorkflowEventStatus,
} from "@/lib/build/workflow-stream-types";
import { mapActivePhaseFromJobType } from "@/lib/build/workflow-status-guards";
import { mapUserFacingWorkflowEvent } from "@/lib/workflow/user-facing-workflow-events";

const GENERIC_TITLES = new Set([
  "Understanding your app",
  "Creating the app plan",
  "Understanding request",
  "Planning app structure",
  "Planning data model",
  "Checking existing files",
  "Applying repair pass",
  "Build needs repair",
]);

function parseLineCounts(detail: string | null | undefined): {
  added?: number;
  removed?: number;
} {
  if (!detail) return {};
  const plus = detail.match(/\+(\d+)\s*[-/]\s*-?(\d+)?/);
  if (plus) {
    return {
      added: Number(plus[1]),
      removed: plus[2] != null ? Number(plus[2]) : undefined,
    };
  }
  const addedOnly = detail.match(/\+(\d+)\s*lines?/i);
  if (addedOnly) return { added: Number(addedOnly[1]) };
  return {};
}

function categoryForJobType(type: BuildJobEventType, meta: Record<string, unknown>): AgentWorkflowCategory {
  if (meta.stream_category && typeof meta.stream_category === "string") {
    return meta.stream_category as AgentWorkflowCategory;
  }
  switch (type) {
    case "writing_file":
      return "file_created";
    case "editing_file":
      return "file_edited";
    case "checking_file":
    case "validating_preview":
      return "quality_check";
    case "fixing_error":
      return meta.repair_pass === true || meta.files_persisted
        ? "repair_started"
        : "issue_found";
    case "completed":
      return "completed";
    case "partial_credit_stop":
      return "partial_credit_stop";
    case "failed":
      return meta.failure_kind === "failed_before_generation"
        ? "failed_before_generation"
        : "failed_after_generation";
    case "refunded":
      return "assistant_message";
    case "preparing_preview":
      return "preview_ready";
    case "understanding_request":
    case "planning_app":
    case "generating_app_identity":
    case "generating_app_icon":
      return "phase_started";
    default:
      return "task_started";
  }
}

function stableKeyForRow(
  category: AgentWorkflowCategory,
  title: string,
  filePath?: string,
): string {
  return `${category}:${title.trim().toLowerCase()}:${filePath ?? ""}`;
}

function rowToStreamEvent(row: BuildJobEventRow, terminal: boolean): AgentWorkflowEvent | null {
  const meta = row.metadata ?? {};
  const mapped = mapUserFacingWorkflowEvent({
    type: row.type,
    title: row.title,
    detail: row.detail,
    filePath: row.file_path,
    metadata: meta,
  });
  if (mapped.hidden) return null;

  let category = categoryForJobType(row.type, meta);
  if (mapped.streamCategory === "assistant_message") category = "assistant_message";
  else if (mapped.isFileEvent) {
    category =
      row.type === "editing_file" || mapped.streamCategory === "file_edited"
        ? "file_edited"
        : "file_created";
  } else if (mapped.streamCategory) {
    category = mapped.streamCategory as AgentWorkflowCategory;
  }

  const title = mapped.title;
  const filePath = mapped.filePath ?? undefined;
  const counts = parseLineCounts(row.detail);
  const added =
    typeof meta.added_lines === "number"
      ? meta.added_lines
      : typeof meta.new_line_count === "number" && !meta.old_line_count
        ? meta.new_line_count
        : counts.added;
  const removed =
    typeof meta.removed_lines === "number" ? meta.removed_lines : counts.removed;

  let status: AgentWorkflowEventStatus = "done";
  if (
    category === "failed_before_generation" ||
    category === "failed_after_generation"
  ) {
    status = "failed";
  } else if (category === "completed" || category === "partial_credit_stop") {
    status = "done";
  } else if (!terminal) {
    status = "done";
  }

  if (row.type === "refunded") {
    return {
      id: row.id,
      category: "assistant_message",
      title: "No credits were charged for this attempt.",
      subtitle: row.detail ?? undefined,
      status: "done",
      at: row.created_at,
      stableKey: `assistant:refund:${row.id}`,
      metadata: meta,
    };
  }

  return {
    id: row.id,
    category,
      title,
      subtitle: mapped.subtitle,
    progress: row.progress_percent ?? undefined,
    phase: mapActivePhaseFromJobType(row.type),
    status,
    filePath,
    addedLines: added,
    removedLines: removed,
    metadata: meta,
    at: row.created_at,
    stableKey: stableKeyForRow(category, title, filePath),
  };
}

/** Merge duplicate stable keys — latest row wins, status upgraded to done when superseded. */
export function coalesceWorkflowStreamEvents(
  rows: BuildJobEventRow[],
  options?: { terminal?: boolean },
): AgentWorkflowEvent[] {
  const terminal = options?.terminal ?? false;
  const byKey = new Map<string, AgentWorkflowEvent>();

  for (const row of rows) {
    const ev = rowToStreamEvent(row, terminal);
    if (!ev) continue;
    const prev = byKey.get(ev.stableKey);
    if (!prev) {
      byKey.set(ev.stableKey, ev);
      continue;
    }
    byKey.set(ev.stableKey, {
      ...ev,
      status:
        ev.status === "failed"
          ? "failed"
          : terminal || prev.status === "done"
            ? "done"
            : ev.status,
    });
  }

  return [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export function deriveActiveWorkflowState(
  events: AgentWorkflowEvent[],
  progressPercent: number,
  ephemeralHint?: string,
): AgentWorkflowActiveState {
  const active =
    [...events].reverse().find((e) => e.status === "active") ??
    events[events.length - 1];
  const phaseLabel = active?.phase ?? "Working";
  const taskLabel = active?.title ?? ephemeralHint ?? "Preparing the next step…";
  const currentFile = [...events]
    .reverse()
    .find((e) => e.filePath && (e.category === "file_created" || e.category === "file_edited"))
    ?.filePath;

  return {
    phaseLabel,
    taskLabel,
    progressPercent: Math.max(1, progressPercent),
    currentFile,
    ephemeralHint,
  };
}

export function extractAssistantMessages(events: AgentWorkflowEvent[]): AgentWorkflowEvent[] {
  return events.filter((e) => e.category === "assistant_message");
}

/** Keep only the latest phase_started when several arrive back-to-back. */
export function collapseRedundantPhaseStarted(
  events: AgentWorkflowEvent[],
): AgentWorkflowEvent[] {
  const out: AgentWorkflowEvent[] = [];
  const seenTitle = new Set<string>();
  for (const ev of events) {
    if (ev.category === "phase_started" && out.length > 0) {
      const last = out[out.length - 1];
      if (last.category === "phase_started") {
        out[out.length - 1] = ev;
        continue;
      }
    }
    const key = `${ev.category}:${ev.title.trim().toLowerCase()}`;
    if (seenTitle.has(key) && ev.category !== "file_created" && ev.category !== "file_edited") {
      continue;
    }
    seenTitle.add(key);
    out.push(ev);
  }
  return out;
}

/** Only the latest in-progress step shows a spinner; earlier steps read as done. */
export function applySingleActiveWorkflowStep(
  events: AgentWorkflowEvent[],
  working: boolean,
): AgentWorkflowEvent[] {
  if (events.length === 0) return events;
  if (!working) {
    return events.map((e) => ({
      ...e,
      status: e.status === "failed" ? "failed" : "done",
    }));
  }

  let activeIndex = events.length - 1;
  while (activeIndex >= 0) {
    const e = events[activeIndex];
    if (
      e.status !== "failed" &&
      e.category !== "completed" &&
      e.category !== "partial_credit_stop"
    ) {
      break;
    }
    activeIndex -= 1;
  }
  if (activeIndex < 0) activeIndex = events.length - 1;

  return events.map((e, i) => ({
    ...e,
    status:
      e.status === "failed"
        ? "failed"
        : e.category === "completed" || e.category === "partial_credit_stop"
          ? "done"
          : i < activeIndex
            ? "done"
            : i === activeIndex
              ? "active"
              : "done",
  }));
}

export function recentTimelineEvents(
  events: AgentWorkflowEvent[],
  limit = 8,
): AgentWorkflowEvent[] {
  const filtered = events.filter(
    (e) =>
      e.category !== "phase_started" ||
      !GENERIC_TITLES.has(e.title),
  );
  return filtered.slice(-limit);
}

/** Chat timeline: coalesce DB rows, one active spinner, no phase spam. */
export function workflowTimelineForChat(
  rows: BuildJobEventRow[],
  options?: { terminal?: boolean; limit?: number },
): AgentWorkflowEvent[] {
  const terminal = options?.terminal ?? false;
  const limit = options?.limit ?? 20;
  const coalesced = coalesceWorkflowStreamEvents(rows, { terminal });
  const collapsed = collapseRedundantPhaseStarted(coalesced);
  const sequential = applySingleActiveWorkflowStep(collapsed, !terminal);
  return recentTimelineEvents(sequential, limit);
}
