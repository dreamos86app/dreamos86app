import type { BuildJobEventRow, BuildJobEventType } from "@/lib/build/build-job-events";
import type { BuildJobPollState } from "@/hooks/use-build-job-progress";
import { MIN_RENDERABLE_FILES } from "@/lib/build/build-success-contract";

/** Facts computed before showing any terminal status card. */
export type BuildStatusFacts = {
  hasBuildJob: boolean;
  hasFiles: boolean;
  fileCount: number;
  hasPreviewSession: boolean;
  hasRepairAttempt: boolean;
  repairAttemptCount: number;
  creditsReserved: boolean;
  creditsCharged: boolean;
  creditsRefunded: boolean;
  partialBuild: boolean;
  terminalStatus: "completed" | "failed" | "partial" | null;
  buildStarted: boolean;
  generationStarted: boolean;
  generationCompleted: boolean;
  contractChecked: boolean;
  previewAttempted: boolean;
  failureKind:
    | "failed_before_generation"
    | "failed_after_generation"
    | "repair_needed"
    | "repair_failed"
    | null;
};

export type WorkflowRunStatus =
  | "waiting_for_prompt"
  | "planning"
  | "generating_files"
  | "checking_files"
  | "preview_ready"
  | "partial_credit_stop"
  | "insufficient_credits_before_start"
  | "failed_before_generation"
  | "failed_after_generation"
  | "repair_needed"
  | "repair_failed"
  | "completed";

export type BuildRunSummaryResolved = {
  status: WorkflowRunStatus;
  headline: string;
  bodyLines: string[];
  showRefundLine: boolean;
  showRepairActions: boolean;
  showPreviewActions: boolean;
  variant: "completed" | "partial" | "failed";
};

const REPAIR_DETAIL_RE =
  /repair pass|needs repair|another repair|before preview|quality repair/i;

function eventFileCount(events: BuildJobEventRow[]): number {
  let max = 0;
  for (const e of events) {
    const meta = e.metadata ?? {};
    const n =
      typeof meta.files_persisted === "number"
        ? meta.files_persisted
        : typeof meta.file_count === "number"
          ? meta.file_count
          : typeof meta.files_kept === "number"
            ? meta.files_kept
            : 0;
    if (n > max) max = n;
    if (e.type === "writing_file" || e.type === "editing_file") {
      if (e.file_path) max = Math.max(max, 1);
    }
  }
  return max;
}

function hasRefundedEvent(events: BuildJobEventRow[]): boolean {
  return events.some((e) => e.type === "refunded");
}

function countRepairSignals(events: BuildJobEventRow[]): number {
  return events.filter(
    (e) =>
      e.type === "fixing_error" ||
      (e.metadata?.repair_pass === true) ||
      (typeof e.detail === "string" && REPAIR_DETAIL_RE.test(e.detail)),
  ).length;
}

export function deriveBuildStatusFacts(input: {
  terminal?: BuildJobPollState | null;
  projectFileCount?: number;
  creditsReserved?: boolean;
}): BuildStatusFacts {
  const terminal = input.terminal;
  const events = terminal?.events ?? [];
  const failureKindMeta = terminal?.latest?.metadata?.failure_kind;
  const metaFileCount = eventFileCount(events);
  const terminalMetaCount =
    typeof terminal?.latest?.metadata?.file_count === "number"
      ? terminal.latest.metadata.file_count
      : typeof terminal?.latest?.metadata?.files_persisted === "number"
        ? terminal.latest.metadata.files_persisted
        : null;
  const fromProject = input.projectFileCount ?? 0;
  let fileCount = fromProject;
  if (terminal?.done && terminalMetaCount != null) {
    fileCount = Math.max(fromProject, terminalMetaCount);
  } else if (!terminal?.done) {
    fileCount = Math.max(fromProject, metaFileCount);
  }
  if (failureKindMeta === "failed_before_generation") {
    fileCount = fromProject;
  }
  const hasFiles = fileCount > 0;
  const partialBuild =
    terminal?.latest?.type === "partial_credit_stop" ||
    events.some((e) => e.type === "partial_credit_stop");
  const failed =
    terminal?.status === "failed" ||
    terminal?.latest?.type === "failed" ||
    events.some((e) => e.type === "failed");
  const completed =
    terminal?.status === "completed" ||
    terminal?.latest?.type === "completed" ||
    events.some((e) => e.type === "completed");

  const failureKind =
    typeof failureKindMeta === "string"
      ? (failureKindMeta as BuildStatusFacts["failureKind"])
      : null;

  const repairAttemptCount = countRepairSignals(events);
  const hasRepairAttempt = repairAttemptCount > 0;

  const generationStarted = events.some((e) =>
    ["writing_file", "editing_file", "saving_files", "generating_app_identity"].includes(e.type),
  );

  let resolvedFailureKind = failureKind;
  if (failed && !partialBuild) {
    if (!hasFiles && repairAttemptCount === 0) {
      resolvedFailureKind = "failed_before_generation";
    } else if (
      resolvedFailureKind === "repair_needed" ||
      (hasFiles && REPAIR_DETAIL_RE.test(terminal?.latest?.detail ?? terminal?.error ?? ""))
    ) {
      resolvedFailureKind = hasRepairAttempt ? "repair_needed" : "failed_after_generation";
    } else if (!resolvedFailureKind) {
      resolvedFailureKind = hasFiles ? "failed_after_generation" : "failed_before_generation";
    }
  }

  return {
    hasBuildJob: Boolean(terminal?.jobId),
    hasFiles,
    fileCount,
    hasPreviewSession: completed || events.some((e) => e.type === "preparing_preview"),
    hasRepairAttempt,
    repairAttemptCount,
    creditsReserved: Boolean(input.creditsReserved),
    creditsCharged: events.some(
      (e) => typeof e.metadata?.credits_charged === "number" && e.metadata.credits_charged > 0,
    ),
    creditsRefunded: hasRefundedEvent(events),
    partialBuild,
    terminalStatus: partialBuild ? "partial" : failed ? "failed" : completed ? "completed" : null,
    buildStarted: events.length > 0,
    generationStarted,
    generationCompleted: events.some((e) => e.type === "saving_files" || e.type === "completed"),
    contractChecked: events.some((e) => e.type === "checking_file" || e.type === "validating_preview"),
    previewAttempted: events.some((e) =>
      ["preparing_preview", "validating_preview", "completed"].includes(e.type),
    ),
    failureKind: resolvedFailureKind,
  };
}

export function resolveWorkflowRunStatus(facts: BuildStatusFacts): WorkflowRunStatus {
  if (facts.partialBuild) return "partial_credit_stop";
  if (facts.terminalStatus === "completed") return "completed";
  if (facts.hasFiles && facts.failureKind === "failed_before_generation") {
    return facts.hasRepairAttempt ? "repair_needed" : "failed_after_generation";
  }
  if (facts.failureKind === "failed_before_generation") return "failed_before_generation";
  if (facts.failureKind === "repair_failed") return "repair_failed";
  if (facts.failureKind === "repair_needed" && facts.hasFiles) return "repair_needed";
  if (facts.terminalStatus === "failed" && facts.hasFiles) return "failed_after_generation";
  if (facts.terminalStatus === "failed") return "failed_before_generation";
  if (facts.generationStarted) return "generating_files";
  if (facts.buildStarted) return "planning";
  return "waiting_for_prompt";
}

export function resolveBuildRunSummary(input: {
  facts: BuildStatusFacts;
  appName?: string;
  filesCount?: number;
  pages?: string[];
  previewReady?: boolean;
  creditsUsed?: number;
  errorDetail?: string;
}): BuildRunSummaryResolved {
  const filesCount = input.filesCount ?? input.facts.fileCount;

  const copy: Record<WorkflowRunStatus, { headline: string; bodyLines: string[] }> = {
    waiting_for_prompt: {
      headline: "Describe what you want to build",
      bodyLines: [],
    },
    planning: {
      headline: "Planning your app…",
      bodyLines: [],
    },
    generating_files: {
      headline: "Writing files…",
      bodyLines: [],
    },
    checking_files: {
      headline: "Checking files…",
      bodyLines: [],
    },
    preview_ready: {
      headline: "Preview is ready",
      bodyLines: [],
    },
    partial_credit_stop: {
      headline: "Partial progress saved",
      bodyLines: [
        "I used your remaining Build Credits and saved progress. Add credits to continue.",
        typeof input.creditsUsed === "number"
          ? `Used ${input.creditsUsed} Build Credit${input.creditsUsed === 1 ? "" : "s"} on this pass.`
          : "",
      ].filter(Boolean),
    },
    insufficient_credits_before_start: {
      headline: "You're out of Build Credits",
      bodyLines: ["Add credits or upgrade to keep building."],
    },
    failed_before_generation: {
      headline: "Couldn't start the build",
      bodyLines: [
        input.errorDetail ??
          "Please try again or adjust your request.",
        input.facts.creditsRefunded
          ? "Credits were returned for this attempt."
          : "No credits were charged.",
      ],
    },
    failed_after_generation: {
      headline: "Draft saved — needs repair before publishing",
      bodyLines: [
        input.errorDetail ??
          "Files were saved, but UI quality needs a repair pass before you publish.",
        input.facts.creditsRefunded ? "Credits were returned for this attempt." : "",
      ].filter(Boolean),
    },
    repair_needed: {
      headline: "Draft saved — needs repair before publishing",
      bodyLines: [
        input.errorDetail ??
          "The first version was saved. Run a repair pass to improve the preview before publishing.",
      ],
    },
    repair_failed: {
      headline: "Repair did not fully complete",
      bodyLines: [
        "Your files were saved, and you can try another repair.",
        input.facts.creditsRefunded ? "Credits were returned for this attempt." : "",
      ].filter(Boolean),
    },
    completed: {
      headline: input.previewReady ? "Preview ready" : input.appName ? `Done — created ${input.appName}` : "Build complete",
      bodyLines: [
        typeof filesCount === "number" && filesCount > 0
          ? `${filesCount} file${filesCount === 1 ? "" : "s"} created or updated`
          : "",
        input.pages?.length ? `Screens: ${input.pages.slice(0, 5).join(", ")}` : "",
        input.previewReady === false ? "Files saved — preview is still preparing." : "You can preview it now.",
      ].filter(Boolean),
    },
  };

  let status = resolveWorkflowRunStatus(input.facts);
  const savedFilesOk = filesCount >= MIN_RENDERABLE_FILES && input.facts.hasFiles;
  const firstPass = input.facts.repairAttemptCount === 0;

  if (input.previewReady && (status === "failed_before_generation" || status === "failed_after_generation")) {
    status = input.facts.failureKind === "repair_needed" && !firstPass ? "repair_needed" : "completed";
  }
  if (input.facts.hasFiles && status === "failed_before_generation") {
    status = firstPass && savedFilesOk ? "completed" : "failed_after_generation";
  }

  if (
    savedFilesOk &&
    firstPass &&
    (status === "failed_after_generation" || status === "repair_needed")
  ) {
    status = input.previewReady !== false ? "completed" : "generating_files";
  }

  const block = copy[status];
  let showRefundLine = input.facts.creditsRefunded;
  let showRepairActions =
    status === "repair_failed" ||
    (status === "repair_needed" && input.facts.repairAttemptCount > 1);
  let showPreviewActions = status === "completed" || status === "preview_ready";

  if (savedFilesOk && firstPass && status === "completed") {
    showRepairActions = false;
    showRefundLine = false;
    showPreviewActions = true;
  }
  const variant: BuildRunSummaryResolved["variant"] =
    status === "completed" || status === "preview_ready"
      ? "completed"
      : status === "partial_credit_stop"
        ? "partial"
        : "failed";

  return {
    status,
    headline: block.headline,
    bodyLines: block.bodyLines,
    showRefundLine,
    showRepairActions,
    showPreviewActions,
    variant: status === "partial_credit_stop" ? "partial" : variant === "completed" ? "completed" : "failed",
  };
}

/** Guard: repair copy must not appear when no files exist. */
export function assertNoRepairCopyBeforeFiles(
  facts: BuildStatusFacts,
  copy: string,
): boolean {
  if (facts.fileCount > 0 || facts.hasFiles) return true;
  return !REPAIR_DETAIL_RE.test(copy);
}

/** Guard: refund copy only when refund actually occurred. */
export function assertRefundCopyAllowed(facts: BuildStatusFacts, showRefund: boolean): boolean {
  if (!showRefund) return true;
  return facts.creditsRefunded;
}

export function failureKindForPersist(input: {
  fileCount: number;
  repairAttempted: boolean;
  previewFailedWithFiles?: boolean;
}): NonNullable<BuildStatusFacts["failureKind"]> {
  if (input.fileCount <= 0) return "failed_before_generation";
  if (input.previewFailedWithFiles) return "repair_needed";
  if (input.repairAttempted) return "repair_needed";
  return "failed_after_generation";
}

export function userSafeFailureTitle(kind: NonNullable<BuildStatusFacts["failureKind"]>): string {
  switch (kind) {
    case "failed_before_generation":
      return "Couldn't start the build";
    case "failed_after_generation":
      return "First version saved — needs attention";
    case "repair_needed":
      return "Repair needed before preview";
    case "repair_failed":
      return "Repair did not fully complete";
    default:
      return "Build stopped";
  }
}

export function userSafeFailureDetail(
  kind: NonNullable<BuildStatusFacts["failureKind"]>,
  raw?: string,
): string {
  if (kind === "failed_before_generation") {
    return "I couldn't generate files for this request. Try again or simplify your prompt.";
  }
  if (raw && !REPAIR_DETAIL_RE.test(raw)) return raw;
  if (kind === "repair_needed") {
    return "The app files were generated, but a repair pass is needed before preview.";
  }
  if (kind === "failed_after_generation") {
    return "The first version was saved, but it needs attention before preview.";
  }
  return raw ?? "Something went wrong during the build.";
}

export function mapActivePhaseFromJobType(type: BuildJobEventType | null): string {
  const map: Partial<Record<BuildJobEventType, string>> = {
    understanding_request: "Understanding the request",
    planning_app: "Designing the app structure",
    generating_app_identity: "Creating name and icon",
    generating_app_icon: "Creating app icon",
    writing_file: "Writing files",
    editing_file: "Editing files",
    checking_file: "Checking quality",
    fixing_error: "Fixing issues",
    validating_preview: "Checking preview",
    saving_files: "Saving files",
    preparing_preview: "Preparing preview",
  };
  return (type && map[type]) || "Working";
}
