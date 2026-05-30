import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { WorkflowEvent, WorkflowEventType } from "@/lib/build/build-pipeline";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  isBuildEventsSchemaError,
  logBuildEventsSetupWarningOnce,
  markBuildJobEventsTableMissing,
} from "@/lib/build/build-events-schema-health";

export type BuildJobEventType =
  | "job_created"
  | "queued"
  | "understanding_request"
  | "planning_app"
  | "generating_app_identity"
  | "generating_app_icon"
  | "writing_file"
  | "editing_file"
  | "checking_file"
  | "fixing_error"
  | "validating_preview"
  | "saving_files"
  | "preparing_preview"
  | "completed"
  | "partial_credit_stop"
  | "failed"
  | "refunded";

export type BuildJobEventRow = {
  id: string;
  created_at: string;
  job_id: string;
  project_id: string;
  user_id: string;
  type: BuildJobEventType;
  title: string;
  detail: string | null;
  file_path: string | null;
  progress_percent: number | null;
  metadata: Record<string, unknown>;
};

type Writer = SupabaseClient<Database>;

const WORKFLOW_TO_JOB: Partial<Record<WorkflowEventType, BuildJobEventType>> = {
  thinking: "understanding_request",
  classified: "understanding_request",
  planning: "planning_app",
  identity: "generating_app_identity",
  icon: "generating_app_icon",
  schema: "planning_app",
  designing: "planning_app",
  reading: "checking_file",
  writing: "writing_file",
  editing: "editing_file",
  validating: "checking_file",
  compiling: "validating_preview",
  repairing: "fixing_error",
  saving: "saving_files",
  charging: "preparing_preview",
  finalizing: "preparing_preview",
  done: "completed",
};

function extractFilePath(detail?: string): string | null {
  if (!detail) return null;
  const m = detail.match(/(?:^|\s)([\w./-]+\.(?:tsx|jsx|ts|js|css|json))(?:\s|$)/i);
  return m?.[1] ?? null;
}

export function mapWorkflowEventToJobType(type: WorkflowEventType): BuildJobEventType {
  return WORKFLOW_TO_JOB[type] ?? "understanding_request";
}

const EVENT_PROGRESS_FLOOR: Partial<Record<BuildJobEventType, number>> = {
  job_created: 1,
  queued: 2,
  understanding_request: 5,
  planning_app: 12,
  generating_app_identity: 18,
  generating_app_icon: 20,
  writing_file: 25,
  editing_file: 35,
  checking_file: 45,
  fixing_error: 50,
  saving_files: 65,
  validating_preview: 75,
  preparing_preview: 90,
  completed: 100,
  partial_credit_stop: 100,
  failed: 100,
};

export function defaultProgressForEventType(type: BuildJobEventType): number {
  return EVENT_PROGRESS_FLOOR[type] ?? 15;
}

export function userTitleForJobEvent(type: BuildJobEventType, label: string): string {
  const map: Partial<Record<BuildJobEventType, string>> = {
    queued: "Queued",
    understanding_request: "Understanding your app",
    planning_app: "Creating the app plan",
    generating_app_identity: "Generating a name and icon",
    generating_app_icon: "Generating app icon",
    writing_file: "Writing files",
    editing_file: "Editing files",
    checking_file: "Checking files",
    fixing_error: "Fixing issues",
    validating_preview: "Checking preview",
    saving_files: "Saving files",
    preparing_preview: "Preparing preview",
    completed: "Preview ready",
    partial_credit_stop: "Saved partial progress",
    failed: "Build stopped",
    refunded: "Credits returned",
  };
  return map[type] ?? label;
}

export async function persistBuildJobEvent(
  writer: Writer,
  input: {
    jobId: string;
    projectId: string;
    userId: string;
    type: BuildJobEventType;
    title: string;
    detail?: string | null;
    filePath?: string | null;
    progressPercent?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const row = {
    job_id: input.jobId,
    project_id: input.projectId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    file_path: input.filePath ?? null,
    progress_percent: input.progressPercent ?? null,
    metadata: (input.metadata ?? {}) as Json,
  };

  const admin = createServiceRoleClient();
  const db = admin ?? writer;
  const { error } = await db.from("build_job_events").insert(row as never);
  if (error) {
    const msg = error.message ?? "";
    if (isBuildEventsSchemaError(msg)) {
      markBuildJobEventsTableMissing(true);
      logBuildEventsSetupWarningOnce();
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[build-events] persist failed:", msg);
    }
  } else {
    markBuildJobEventsTableMissing(false);
  }
}

export async function persistWorkflowEvent(
  writer: Writer,
  ctx: { jobId: string; projectId: string; userId: string },
  ev: WorkflowEvent,
  progressPercent?: number,
): Promise<void> {
  // Terminal "failed" is written only by executeStagedBuildJob after finalizeBuildFailed.
  if (ev.type === "failed") return;

  const type = mapWorkflowEventToJobType(ev.type);
  const filePath =
    extractFilePath(ev.detail) ??
    extractFilePath(ev.label) ??
    (ev.detail && /^[\w./-]+\.[a-z0-9]+$/i.test(ev.detail.trim()) ? ev.detail.trim() : null);
  const pct = Math.max(
    progressPercent ?? defaultProgressForEventType(type),
    defaultProgressForEventType(type),
  );
  const specificTitle = ev.label?.trim();
  const useSpecific =
    Boolean(specificTitle) &&
    specificTitle !== userTitleForJobEvent(type, specificTitle);
  const lineMeta = ev.meta?.fileLineMeta;
  const streamCategory =
    ev.meta?.streamCategory ??
    (ev.type === "repairing"
      ? "repair_started"
      : ev.type === "writing"
        ? "file_created"
        : ev.type === "editing"
          ? "file_edited"
          : undefined);

  await persistBuildJobEvent(writer, {
    jobId: ctx.jobId,
    projectId: ctx.projectId,
    userId: ctx.userId,
    type,
    title: useSpecific ? specificTitle! : userTitleForJobEvent(type, ev.label),
    detail: ev.detail ?? ev.label,
    filePath: filePath ?? ev.meta?.filePath ?? null,
    progressPercent: pct,
    metadata: {
      stream_category: streamCategory,
      display_title: useSpecific ? specificTitle : undefined,
      repair_pass: ev.type === "repairing" ? true : undefined,
      ...(lineMeta
        ? {
            added_lines: lineMeta.added_lines,
            removed_lines: lineMeta.removed_lines,
            old_line_count: lineMeta.old_line_count,
            new_line_count: lineMeta.new_line_count,
          }
        : {}),
    },
  });
}

export async function persistAssistantBuildMessage(
  writer: Writer,
  ctx: { jobId: string; projectId: string; userId: string },
  input: { message: string; progressPercent?: number },
): Promise<void> {
  await persistBuildJobEvent(writer, {
    ...ctx,
    type: "understanding_request",
    title: input.message.slice(0, 200),
    detail: input.message,
    progressPercent: input.progressPercent ?? 10,
    metadata: {
      stream_category: "assistant_message",
      display_title: input.message.slice(0, 200),
    },
  });
}

function openingAssistantMessage(promptHint?: string): { title: string; detail: string } {
  const hint = promptHint?.trim() ?? "";
  const lower = hint.toLowerCase();
  if (/nonprofit|donor|donation|campaign|recurring|thank-?you|crm/.test(lower)) {
    return {
      title: "Nonprofit donor CRM",
      detail:
        "I'll build this as a nonprofit donor CRM. I'm going to map the screens, data, and automation flow first.",
    };
  }
  if (hint) {
    return {
      title: "Understanding the request",
      detail: `I'll shape this into an app based on your request.`,
    };
  }
  return {
    title: "Starting your build",
    detail: "Reading your prompt and choosing the right build path",
  };
}

export async function emitInitialBuildEvents(
  writer: Writer,
  ctx: { jobId: string; projectId: string; userId: string; promptHint?: string },
): Promise<void> {
  const opening = openingAssistantMessage(ctx.promptHint);
  await persistBuildJobEvent(writer, {
    ...ctx,
    type: "job_created",
    title: opening.title,
    detail: opening.detail,
    progressPercent: 2,
    metadata: {
      stream_category: "assistant_message",
      display_title: opening.title,
    },
  });
  const hint = ctx.promptHint?.trim().slice(0, 160);
  await persistBuildJobEvent(writer, {
    ...ctx,
    type: "understanding_request",
    title: hint ? `Understanding: ${hint}` : "Understanding your request",
    detail: "Mapping screens, data, and flows",
    progressPercent: 8,
    metadata: { stream_category: "phase_started" },
  });
}
