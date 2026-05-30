import { persistBuildJobEvent } from "@/lib/build/build-job-events";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type BuildWorkerTraceStage =
  | "worker_claim_attempt"
  | "worker_claimed"
  | "worker_claim_failed"
  | "build_pipeline_entered"
  | "preflight_started"
  | "preflight_completed"
  | "planning_app_started"
  | "planner_model_call_started"
  | "planner_model_call_completed"
  | "planner_model_call_failed"
  | "planner_model_call_timeout"
  | "deterministic_plan_fallback_used"
  | "identity_started"
  | "identity_completed"
  | "identity_failed"
  | "file_generation_started"
  | "scaffold_fallback_applied"
  | "contract_started"
  | "contract_completed"
  | "persist_started"
  | "persist_completed"
  | "preview_started"
  | "preview_completed"
  | "job_completed"
  | "job_failed";

export type ModelCallState = "idle" | "pending" | "finished" | "failed" | "timeout";

export type BuildWorkerTraceRow = {
  stage: BuildWorkerTraceStage;
  at: string;
  detail?: string;
  modelCallState?: ModelCallState;
  provider?: string | null;
  model?: string | null;
  timeoutMs?: number;
  abortControllerUsed?: boolean;
};

export type BuildWorkerTraceSnapshot = {
  buildJobId: string;
  operationId: string;
  executionInstanceId: string;
  projectId: string;
  startedAt: string;
  lastStage: BuildWorkerTraceStage;
  lastAt: string;
  rows: BuildWorkerTraceRow[];
  modelCall: {
    state: ModelCallState;
    operationType: string | null;
    provider: string | null;
    model: string | null;
    timeoutMs: number | null;
    startedAt: string | null;
  };
  heartbeatRunning: boolean;
};

const traces = new Map<string, BuildWorkerTraceSnapshot>();

const FRIENDLY_EVENT_TITLE: Partial<Record<BuildWorkerTraceStage, string>> = {
  worker_claim_attempt: "Starting build",
  worker_claimed: "Build worker ready",
  build_pipeline_entered: "Creating the app structure",
  preflight_started: "Preparing build",
  preflight_completed: "Preparation complete",
  planning_app_started: "Creating the app plan",
  planner_model_call_started: "Creating the app plan",
  planner_model_call_completed: "App plan ready",
  deterministic_plan_fallback_used: "Creating the app structure",
  identity_started: "Generating a name and icon",
  identity_completed: "App identity ready",
  file_generation_started: "Writing files",
  scaffold_fallback_applied: "Adding the required pages",
  contract_started: "Checking the interface",
  contract_completed: "Quality checks complete",
  persist_started: "Saving files",
  persist_completed: "Files saved",
  preview_started: "Preparing preview",
  preview_completed: "Preview ready",
  job_completed: "Preview ready",
  job_failed: "Build needs repair",
};

function progressForStage(stage: BuildWorkerTraceStage): number {
  const map: Partial<Record<BuildWorkerTraceStage, number>> = {
    worker_claim_attempt: 8,
    worker_claimed: 10,
    build_pipeline_entered: 14,
    preflight_started: 16,
    preflight_completed: 18,
    planning_app_started: 20,
    planner_model_call_started: 22,
    planner_model_call_completed: 28,
    deterministic_plan_fallback_used: 28,
    identity_started: 32,
    identity_completed: 38,
    file_generation_started: 45,
    scaffold_fallback_applied: 52,
    contract_started: 60,
    contract_completed: 70,
    persist_started: 82,
    persist_completed: 88,
    preview_started: 92,
    preview_completed: 98,
    job_completed: 100,
    job_failed: 100,
  };
  return map[stage] ?? 25;
}

export function createBuildWorkerTrace(input: {
  buildJobId: string;
  operationId: string;
  executionInstanceId: string;
  projectId: string;
}): BuildWorkerTraceSnapshot {
  const snap: BuildWorkerTraceSnapshot = {
    ...input,
    startedAt: new Date().toISOString(),
    lastStage: "worker_claim_attempt",
    lastAt: new Date().toISOString(),
    rows: [],
    modelCall: {
      state: "idle",
      operationType: null,
      provider: null,
      model: null,
      timeoutMs: null,
      startedAt: null,
    },
    heartbeatRunning: false,
  };
  traces.set(input.buildJobId, snap);
  return snap;
}

export function getBuildWorkerTrace(buildJobId: string): BuildWorkerTraceSnapshot | null {
  return traces.get(buildJobId) ?? null;
}

export function clearBuildWorkerTrace(buildJobId: string): void {
  traces.delete(buildJobId);
}

export function traceBuildWorkerStage(
  snap: BuildWorkerTraceSnapshot,
  stage: BuildWorkerTraceStage,
  detail?: string,
  extra?: Partial<BuildWorkerTraceRow>,
): void {
  const row: BuildWorkerTraceRow = {
    stage,
    at: new Date().toISOString(),
    detail,
    ...extra,
  };
  snap.rows.push(row);
  if (snap.rows.length > 80) snap.rows.shift();
  snap.lastStage = stage;
  snap.lastAt = row.at;

  console.info("[build-worker-trace]", {
    operation_id: snap.operationId,
    build_job_id: snap.buildJobId,
    execution_instance_id: snap.executionInstanceId,
    stage,
    detail: detail ?? null,
    timestamp: row.at,
  });
}

export function traceModelCallStarted(
  snap: BuildWorkerTraceSnapshot,
  input: {
    operationType: string;
    provider?: string | null;
    model?: string | null;
    timeoutMs: number;
  },
): void {
  snap.modelCall = {
    state: "pending",
    operationType: input.operationType,
    provider: input.provider ?? null,
    model: input.model ?? null,
    timeoutMs: input.timeoutMs,
    startedAt: new Date().toISOString(),
  };
  traceBuildWorkerStage(snap, "planner_model_call_started", input.operationType, {
    modelCallState: "pending",
    provider: input.provider,
    model: input.model,
    timeoutMs: input.timeoutMs,
    abortControllerUsed: true,
  });
}

export function traceModelCallEnded(
  snap: BuildWorkerTraceSnapshot,
  outcome: "finished" | "failed" | "timeout",
  detail?: string,
): void {
  snap.modelCall.state = outcome;
  const stage: BuildWorkerTraceStage =
    outcome === "finished"
      ? "planner_model_call_completed"
      : outcome === "timeout"
        ? "planner_model_call_timeout"
        : "planner_model_call_failed";
  traceBuildWorkerStage(snap, stage, detail, { modelCallState: outcome });
}

let lastPersistedTraceAt = new Map<string, number>();

/** Persist trace to build_job_events (coalesced — at most one row per 4s per job). */
export async function persistTraceStage(
  writer: SupabaseClient<Database>,
  input: {
    jobId: string;
    projectId: string;
    userId: string;
    snap: BuildWorkerTraceSnapshot;
    stage: BuildWorkerTraceStage;
    detail?: string;
  },
): Promise<void> {
  const now = Date.now();
  const last = lastPersistedTraceAt.get(input.jobId) ?? 0;
  const terminal = input.stage === "job_completed" || input.stage === "job_failed";
  if (!terminal && now - last < 4000) return;
  lastPersistedTraceAt.set(input.jobId, now);

  const title = FRIENDLY_EVENT_TITLE[input.stage] ?? "Working on your app";
  const isFileStage =
    input.stage === "persist_started" ||
    input.stage === "persist_completed";
  await persistBuildJobEvent(writer, {
    jobId: input.jobId,
    projectId: input.projectId,
    userId: input.userId,
    type: isFileStage
      ? "saving_files"
      : input.stage.includes("preview")
        ? "preparing_preview"
        : input.stage.includes("contract")
          ? "checking_file"
          : input.stage.includes("identity")
            ? "generating_app_identity"
            : input.stage === "scaffold_fallback_applied" || input.stage === "file_generation_started"
              ? "planning_app"
              : input.stage.includes("plan") || input.stage.includes("planner")
                ? "planning_app"
                : "understanding_request",
    title,
    detail: input.detail ?? title,
    progressPercent: progressForStage(input.stage),
    metadata: {
      trace_stage: input.stage,
      hidden:
        input.stage === "worker_claim_attempt" || input.stage === "build_pipeline_entered",
      operation_id: input.snap.operationId,
      execution_instance_id: input.snap.executionInstanceId,
      model_call_state: input.snap.modelCall.state,
      provider: input.snap.modelCall.provider,
      model: input.snap.modelCall.model,
      timeout_ms: input.snap.modelCall.timeoutMs,
    },
  });
}

export function setTraceHeartbeatRunning(snap: BuildWorkerTraceSnapshot, running: boolean): void {
  snap.heartbeatRunning = running;
}
