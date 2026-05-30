import type { BuildJobEventRow, BuildJobEventType } from "@/lib/build/build-job-events";
import type {
  AgentWorkflowActiveState,
  AgentWorkflowCategory,
  AgentWorkflowEvent,
  AgentWorkflowEventStatus,
} from "@/lib/build/workflow-stream-types";
import { mapActivePhaseFromJobType } from "@/lib/build/workflow-status-guards";

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

const INTERNAL_LABEL_RE =
  /worker_claim|build_pipeline_entered|scaffold_fallback|premium_ui_repair|ui_quality_\d|score\s*\d+\s*\/\s*85|code_repair_hard|code_repair_soft|planner_model|execution_instance|trace_stage/i;

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

function sanitizeInternalLabel(text: string): string | null {
  const t = text.trim();
  if (!t || INTERNAL_LABEL_RE.test(t)) return null;
  return t;
}

function preferTitle(row: BuildJobEventRow): string {
  const meta = row.metadata ?? {};
  if (typeof meta.display_title === "string" && meta.display_title.trim()) {
    const display = sanitizeInternalLabel(meta.display_title);
    if (display) return display;
  }
  const title = sanitizeInternalLabel(row.title?.trim() ?? "") ?? "";
  if (title && !GENERIC_TITLES.has(title)) return title;
  if (row.detail?.trim() && row.detail.length < 120 && !GENERIC_TITLES.has(row.detail.trim())) {
    return row.detail.trim();
  }
  return title || row.detail?.trim() || "Working";
}

function rowToStreamEvent(row: BuildJobEventRow, terminal: boolean): AgentWorkflowEvent {
  const meta = row.metadata ?? {};
  const category = categoryForJobType(row.type, meta);
  const title = preferTitle(row);
  const filePath = row.file_path ?? undefined;
  const counts = parseLineCounts(row.detail);
  const added =
    typeof meta.added_lines === "number"
      ? meta.added_lines
      : typeof meta.new_line_count === "number" && !meta.old_line_count
        ? meta.new_line_count
        : counts.added;
  const removed =
    typeof meta.removed_lines === "number" ? meta.removed_lines : counts.removed;

  let status: AgentWorkflowEventStatus = terminal ? "done" : "active";
  if (
    category === "failed_before_generation" ||
    category === "failed_after_generation"
  ) {
    status = "failed";
  } else if (category === "completed" || category === "partial_credit_stop") {
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
    subtitle: row.detail && row.detail !== title ? row.detail : undefined,
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
