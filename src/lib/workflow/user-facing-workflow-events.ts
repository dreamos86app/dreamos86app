import type { BuildJobEventType } from "@/lib/build/build-job-events";
import { extractWorkflowFilePath, isValidWorkflowFilePath } from "@/lib/workflow/workflow-file-path";

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i;
const INTERNAL_RE =
  /worker_claim|build_pipeline|weak_output|scaffold_fallback|premium_ui_repair|ui_quality_\d|score\s*\d+\s*\/\s*\d+|code_repair_|planner_model|execution_instance|trace_stage|partial_credit_stop:|scaffold_fallback_used:/i;
const QUALITY_SCORE_RE = /\(score\s*\d+\s*\/\s*\d+\)/i;

const TRACE_STAGE_COPY: Record<string, string> = {
  worker_claim_attempt: "Starting build",
  worker_claimed: "Build started",
  worker_claim_failed: "Could not start build",
  build_pipeline_entered: "Mapping your app",
  preflight_started: "Reading your request",
  preflight_completed: "Request understood",
  planning_app_started: "Mapping screens and data",
  planner_model_call_started: "Mapping screens and data",
  planner_model_call_completed: "App structure ready",
  planner_model_call_failed: "Retrying app structure",
  planner_model_call_timeout: "Retrying app structure",
  deterministic_plan_fallback_used: "Mapping core screens",
  identity_started: "Creating app identity",
  identity_completed: "App identity ready",
  identity_failed: "Using a default name and icon",
  file_generation_started: "Writing core files",
  scaffold_fallback_applied: "Adding the required app structure",
  contract_started: "Checking app quality",
  contract_completed: "Quality checks complete",
  persist_started: "Saving files",
  persist_completed: "Files saved",
  preview_started: "Preparing preview",
  preview_completed: "Preview ready",
  job_completed: "Preview ready",
  job_failed: "Build needs attention",
};

const INTERNAL_KEY_COPY: Record<string, string> = {
  weak_output_detected: "Strengthening the app structure",
  scaffold_fallback_used: "Adding the required app structure",
  ui_quality_repair_started: "Improving the interface",
  ui_quality_repair_completed: "Interface improved",
  contract_validation_started: "Checking app quality",
  contract_validation_failed_with_files: "Draft saved — checking what needs improvement",
};

const LABEL_PATTERN_COPY: Array<{ re: RegExp; title: string }> = [
  { re: /^Premium UI repair\s*\d+/i, title: "Improving the interface" },
  { re: /^Repair pass\s*\d+/i, title: "Fixing issues" },
  { re: /^weak_output_detected$/i, title: "Strengthening the app structure" },
  { re: /^Generating frontend files$/i, title: "Writing core files" },
  { re: /^Generating backend files$/i, title: "Adding server files" },
  { re: /^Adding the required pages/i, title: "Adding the required app structure" },
  { re: /^Validating \d+ files$/i, title: "Checking files" },
  { re: /^Archetype:/i, title: "Identifying app type" },
];

export type UserFacingWorkflowInput = {
  type?: BuildJobEventType | string;
  title?: string | null;
  detail?: string | null;
  filePath?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type UserFacingWorkflowOutput = {
  title: string;
  subtitle?: string;
  hidden: boolean;
  filePath: string | null;
  isFileEvent: boolean;
  streamCategory?: string;
};

function stripQualityScores(text: string): string {
  return text.replace(QUALITY_SCORE_RE, "").replace(/\s+/g, " ").trim();
}

function mapInternalKey(detail: string): string | null {
  const key = detail.split(":")[0]?.trim();
  if (key && INTERNAL_KEY_COPY[key]) return INTERNAL_KEY_COPY[key];
  for (const [k, v] of Object.entries(INTERNAL_KEY_COPY)) {
    if (detail.includes(k)) return v;
  }
  return null;
}

function mapByPatterns(text: string): string | null {
  for (const { re, title } of LABEL_PATTERN_COPY) {
    if (re.test(text)) return title;
  }
  return null;
}

export function mapUserFacingWorkflowEvent(input: UserFacingWorkflowInput): UserFacingWorkflowOutput {
  const meta = input.metadata ?? {};
  const traceStage = typeof meta.trace_stage === "string" ? meta.trace_stage : null;
  const internalKey = typeof meta.internal_key === "string" ? meta.internal_key : null;
  const displayTitle =
    typeof meta.display_title === "string" ? stripQualityScores(meta.display_title.trim()) : "";

  let rawTitle = stripQualityScores((input.title ?? "").trim());
  let rawDetail = stripQualityScores((input.detail ?? "").trim());

  if (INTERNAL_RE.test(rawTitle) || INTERNAL_RE.test(rawDetail)) {
    const fromKey = mapInternalKey(rawDetail || rawTitle);
    const fromTrace = traceStage ? TRACE_STAGE_COPY[traceStage] : null;
    const fromPattern = mapByPatterns(rawTitle) ?? mapByPatterns(rawDetail);
    const mapped = fromKey ?? fromTrace ?? fromPattern;
    if (mapped) {
      rawTitle = mapped;
      rawDetail = "";
    } else if (traceStage && TRACE_STAGE_COPY[traceStage]) {
      rawTitle = TRACE_STAGE_COPY[traceStage];
      rawDetail = "";
    } else {
      return { title: "Working on your app", hidden: false, filePath: null, isFileEvent: false };
    }
  }

  if (internalKey && INTERNAL_KEY_COPY[internalKey]) {
    rawTitle = INTERNAL_KEY_COPY[internalKey];
    rawDetail = "";
  }

  if (SNAKE_CASE_RE.test(rawTitle) && !displayTitle) {
    const fromKey = mapInternalKey(rawTitle);
    rawTitle = fromKey ?? TRACE_STAGE_COPY[rawTitle] ?? "Working on your app";
    rawDetail = "";
  }

  if (displayTitle && !INTERNAL_RE.test(displayTitle)) {
    rawTitle = displayTitle;
  }

  const patternMapped = mapByPatterns(rawTitle);
  if (patternMapped) rawTitle = patternMapped;

  const filePath =
    extractWorkflowFilePath(input.filePath, meta.file_path as string | undefined, rawDetail, rawTitle) ??
    null;

  const isWriting =
    input.type === "writing_file" || input.type === "editing_file" || meta.stream_category === "file_created";
  const isFileEvent = Boolean(filePath && isValidWorkflowFilePath(filePath) && isWriting);

  const hidden =
    meta.hidden === true ||
    rawTitle === "worker_claim_attempt" ||
    traceStage === "worker_claim_attempt" ||
    traceStage === "build_pipeline_entered";

  let streamCategory = typeof meta.stream_category === "string" ? meta.stream_category : undefined;
  if (isFileEvent) {
    streamCategory =
      input.type === "editing_file" || meta.stream_category === "file_edited" ? "file_edited" : "file_created";
  } else if (meta.stream_category === "assistant_message") {
    streamCategory = "assistant_message";
  } else {
    streamCategory = streamCategory ?? "task_started";
  }

  const subtitle =
    rawDetail && rawDetail !== rawTitle && !isFileEvent && !INTERNAL_RE.test(rawDetail) ? rawDetail : undefined;

  return {
    title: rawTitle || "Working on your app",
    subtitle,
    hidden,
    filePath: isFileEvent ? filePath : null,
    isFileEvent,
    streamCategory,
  };
}

export function userFacingRepairPassLabel(attemptIndex: number): string {
  const labels = ["Improving layout", "Polishing components", "Final UI check"];
  return labels[attemptIndex] ?? "Improving the interface";
}

export function userFacingArchetypeLabel(archetypeLabel: string): string {
  return `I'll build this as a ${archetypeLabel}. I'm mapping the screens, data, and core flow first.`;
}
