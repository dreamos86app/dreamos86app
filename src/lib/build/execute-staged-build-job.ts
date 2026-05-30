import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { runStagedBuildPipeline } from "@/lib/build/build-pipeline";
import { calculateCreditsForStagedBuild } from "@/lib/credits/credit-pricing";
import { reconcileGenerationReservation } from "@/lib/billing/credit-reservations";
import { assertProfitableCharge } from "@/lib/billing/credit-profit-guard";
import { finalizeBuildSuccess, finalizeBuildFailed } from "@/lib/build/finalize-build";
import { finalizeBuildPartial } from "@/lib/build/finalize-build-partial";
import {
  userFacingPartialStopMessage,
  workflowEventCreditStageCost,
} from "@/lib/billing/partial-build-credits";
import { filterRenderableBuildFiles } from "@/lib/build/generated-file-utils";
import { getAppUrl } from "@/lib/app-url";
import { hasSuccessfulChargeForOperation } from "@/lib/chat/server-idempotency";
import { clearGeneratedBuildFiles } from "@/lib/build/persist-generated-files";
import { assertBuildFilesPersisted } from "@/lib/build/assert-build-files-persisted";
import { MIN_RENDERABLE_FILES } from "@/lib/build/build-success-contract";
import { canCompleteWithSavedFiles } from "@/lib/build/post-build-contract";
import { startPreviewSession } from "@/lib/preview/preview-build-service";
import { lifecyclePatch } from "@/lib/projects/project-lifecycle";
import {
  persistAssistantBuildMessage,
  persistBuildJobEvent,
  persistWorkflowEvent,
} from "@/lib/build/build-job-events";
import {
  failureKindForPersist,
  userSafeFailureDetail,
  userSafeFailureTitle,
} from "@/lib/build/workflow-status-guards";
import { logServerOperation } from "@/lib/ops/server-ops-log";
import { normalizeBuildError } from "@/lib/build/build-error";
import {
  claimBuildJobWorker,
  createBuildWorkerContext,
  transitionBuildJobStatus,
} from "@/lib/build/build-job-terminal";
import { tracePersistGeneratedFiles } from "@/lib/build/files-persist-trace";
import {
  createBuildWorkerTrace,
  clearBuildWorkerTrace,
  getBuildWorkerTrace,
  persistTraceStage,
  setTraceHeartbeatRunning,
  traceBuildWorkerStage,
} from "@/lib/build/build-worker-trace";
import { writeWorkerStallSnapshot } from "@/lib/build/worker-stall-snapshot";

type Writer = SupabaseClient<Database>;

/** Prevents duplicate `after()` invocations from running two pipelines on one job (dev server). */
const inFlightBuildJobs = new Set<string>();

export type ExecuteStagedBuildJobInput = {
  writer: Writer;
  userId: string;
  userEmail: string;
  operationId: string;
  projectId: string;
  buildJobId: string;
  userPrompt: string;
  memoryBlock: string;
  conversationId?: string;
  modelId: string;
  reservedCredits?: number;
  partialCreditBuild?: boolean;
  quotedCreditsRequired?: number;
  blueprintBlock?: string;
  userSelectedModelId?: string | null;
};

async function refundBuildReservation(input: {
  writer: Writer;
  userId: string;
  operationId: string;
  reservedCredits?: number;
  providerCostUsd: number;
  projectId: string;
  buildJobId: string;
}) {
  if (!input.reservedCredits || input.reservedCredits <= 0) return;
  await reconcileGenerationReservation(input.writer, {
    userId: input.userId,
    generationId: input.operationId,
    reservedCredits: input.reservedCredits,
    actualUserCredits: 0,
    providerCostUsd: input.providerCostUsd,
    success: false,
    projectId: input.projectId,
  }).catch(() => undefined);
  await persistBuildJobEvent(input.writer, {
    jobId: input.buildJobId,
    projectId: input.projectId,
    userId: input.userId,
    type: "refunded",
    title: "Credits returned",
    detail: "Reserved credits were returned for this attempt.",
    metadata: { stream_category: "assistant_message" },
    progressPercent: 100,
  });
}

/** Runs staged build in background after /api/chat returns. */
export async function executeStagedBuildJob(input: ExecuteStagedBuildJobInput): Promise<void> {
  if (inFlightBuildJobs.has(input.buildJobId)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[execute-staged-build] duplicate worker skipped", input.buildJobId);
    }
    return;
  }
  inFlightBuildJobs.add(input.buildJobId);
  let buildFinishedSuccess = false;
  let jobClaimed = false;
  const workerCtx = createBuildWorkerContext(input.operationId);

  const eventCtx = {
    jobId: input.buildJobId,
    projectId: input.projectId,
    userId: input.userId,
  };

  const trace = createBuildWorkerTrace({
    buildJobId: input.buildJobId,
    operationId: input.operationId,
    executionInstanceId: workerCtx.executionInstanceId,
    projectId: input.projectId,
  });

  let stepIndex = 0;
  const progressForStep = () => Math.min(90, 25 + stepIndex++ * 7);
  let lastActivityAt = Date.now();
  let currentStepLabel = "Creating the app plan";
  let lastHeartbeatPersist = 0;

  const persistStage = async (
    stage: Parameters<typeof traceBuildWorkerStage>[1],
    detail?: string,
  ) => {
    traceBuildWorkerStage(trace, stage, detail);
    await persistTraceStage(input.writer, {
      ...eventCtx,
      snap: trace,
      stage,
      detail,
    }).catch(() => undefined);
    lastActivityAt = Date.now();
  };

  setTraceHeartbeatRunning(trace, true);
  const heartbeat = setInterval(() => {
    if (Date.now() - lastActivityAt < 8000) return;
    const snap = getBuildWorkerTrace(input.buildJobId);
    const stageLabel = snap?.lastStage ?? "working";
    if (Date.now() - lastHeartbeatPersist < 8000) return;
    lastHeartbeatPersist = Date.now();
    void persistBuildJobEvent(input.writer, {
      ...eventCtx,
      type: "understanding_request",
      title: "Still working",
      detail: `Still working on ${currentStepLabel}…`,
      progressPercent: Math.min(88, 25 + stepIndex * 5),
      metadata: {
        trace_stage: stageLabel,
        heartbeat: true,
        operation_id: input.operationId,
        execution_instance_id: workerCtx.executionInstanceId,
      },
    }).catch(() => {});
  }, 8000);

  const PIPELINE_HARD_CAP_MS = 5 * 60 * 1000;

  try {
    await persistStage("worker_claim_attempt");
    const claim = await claimBuildJobWorker(input.writer, input.buildJobId, workerCtx);
    if (!claim.claimed) {
      await persistStage("worker_claim_failed", claim.error ?? "not_claimed");
      if (process.env.NODE_ENV !== "production") {
        console.warn("[execute-staged-build] job already claimed or claim failed", {
          buildJobId: input.buildJobId,
          error: claim.error,
        });
      }
      return;
    }
    jobClaimed = true;
    await persistStage("worker_claimed");
    await persistStage("build_pipeline_entered");
    await persistStage("planning_app_started", "Organizing screens and features");
    await persistAssistantBuildMessage(input.writer, eventCtx, {
      message: "I'll map your app structure and start generating files.",
      progressPercent: 10,
    }).catch(() => undefined);

    const pipelinePromise = runStagedBuildPipeline({
      writer: input.writer,
      userId: input.userId,
      userEmail: input.userEmail,
      operationId: input.operationId,
      projectId: input.projectId,
      buildJobId: input.buildJobId,
      userPrompt: input.userPrompt,
      memoryBlock: input.memoryBlock,
      blueprintBlock: input.blueprintBlock,
      conversationId: input.conversationId,
      userSelectedModelId: input.userSelectedModelId ?? input.modelId,
      buildTrace: trace,
      shouldStopForCredits: () => creditTracker.stop,
      onWorkflowEvent: async (ev) => {
        lastActivityAt = Date.now();
        currentStepLabel = ev.label;
        if (input.partialCreditBuild && Number.isFinite(creditTracker.budget)) {
          creditTracker.used += workflowEventCreditStageCost(ev.type);
          if (creditTracker.used >= creditTracker.budget) {
            creditTracker.stop = true;
          }
        }
        await persistWorkflowEvent(input.writer, eventCtx, ev, progressForStep());
      },
    });

    const creditTracker = {
      used: 0,
      budget: input.partialCreditBuild ? Math.max(1, input.reservedCredits ?? 0) : Infinity,
      stop: false,
    };

    const pr = await Promise.race([
      pipelinePromise,
      new Promise<Awaited<typeof pipelinePromise>>((_, reject) => {
        setTimeout(
          () => reject(new Error("build_pipeline_hard_cap_exceeded")),
          PIPELINE_HARD_CAP_MS,
        );
      }),
    ]).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("hard_cap")) {
        return {
          ok: false,
          visibleText: "Build timed out — try again or use a shorter prompt.",
          meta: null,
          iconSvg: null,
          iconUrl: null,
          appName: "Dream App",
          files: [] as never[],
          events: [],
          totalProviderCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          primaryModelId: input.modelId,
          complexity: 1,
          uiQualityScore: 0,
          buildContract: {
            passed: false,
            allowed: false,
            failures: ["build_pipeline_hard_cap"],
            renderableCount: 0,
            pageCount: 0,
            uiQualityScore: 0,
            previewReady: false,
            userMessage: "Build timed out before completion.",
          },
          appArchetype: "unknown",
          errorMessage: msg,
        } satisfies Awaited<typeof pipelinePromise>;
      }
      throw err;
    });

    const alreadyCharged = await hasSuccessfulChargeForOperation(
      input.writer,
      input.userId,
      input.operationId,
    );

    if (input.conversationId && pr.visibleText) {
      await input.writer.from("messages").insert({
        conversation_id: input.conversationId,
        user_id: input.userId,
        role: "assistant",
        content: pr.visibleText,
        model_id: pr.primaryModelId,
        credits_used: 0,
        finish_reason: pr.ok ? "stop" : "error",
        tokens_input: pr.totalInputTokens,
        tokens_output: pr.totalOutputTokens,
        metadata: {
          mode: "build",
          staged: true,
          async: true,
          build_success: pr.ok,
          build_job_id: input.buildJobId,
        } as never,
      });
    }

    const saveableFileCount = filterRenderableBuildFiles(pr.files).length;
    const buildSucceeded =
      (pr.ok && pr.buildContract.passed) ||
      canCompleteWithSavedFiles(saveableFileCount, pr.buildContract.failures);
    const partialCreditStop =
      ("partialCreditStop" in pr && pr.partialCreditStop === true) ||
      pr.errorMessage === "partial_credit_stop";

    if (
      !buildSucceeded &&
      input.partialCreditBuild &&
      (partialCreditStop || saveableFileCount > 0)
    ) {
      const creditsUsed = Math.max(
        1,
        Math.min(input.reservedCredits ?? 1, creditTracker.used || (input.reservedCredits ?? 1)),
      );
      const partialMessage = userFacingPartialStopMessage(
        Math.floor(creditsUsed) || input.reservedCredits || 1,
      );

      await persistStage("persist_started", `${pr.files.length} files in memory`);
      const { result: persist } = await tracePersistGeneratedFiles({
        writer: input.writer,
        projectId: input.projectId,
        ownerId: input.userId,
        files: pr.files,
        operationId: input.operationId,
        executionInstanceId: workerCtx.executionInstanceId,
      });

      await persistStage("persist_completed", `${persist.savedCount} files saved`);

      if (!alreadyCharged && input.reservedCredits && input.reservedCredits > 0) {
        const chargeCalc = calculateCreditsForStagedBuild({
          providerCostUsd: pr.totalProviderCostUsd,
          complexity: pr.complexity,
          inputTokens: pr.totalInputTokens,
          outputTokens: pr.totalOutputTokens,
          primaryModelId: pr.primaryModelId,
          fileCount: Math.max(persist.savedCount, saveableFileCount),
        });
        const profitable = assertProfitableCharge(
          chargeCalc.creditsToCharge,
          chargeCalc.estimatedProviderCostUsd,
        );
        if (profitable.ok) {
          await reconcileGenerationReservation(input.writer, {
            userId: input.userId,
            generationId: input.operationId,
            reservedCredits: input.reservedCredits,
            actualUserCredits: Math.min(input.reservedCredits, chargeCalc.creditsToCharge),
            providerCostUsd: chargeCalc.estimatedProviderCostUsd,
            success: true,
            projectId: input.projectId,
          });
        }
      }

      await finalizeBuildPartial({
        writer: input.writer,
        userId: input.userId,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
        workerCtx,
        appName: pr.appName,
        meta: pr.meta,
        fileCount: Math.max(persist.savedCount, saveableFileCount),
        creditsUsed: Math.floor(creditsUsed),
        remainingSummary: partialMessage,
        skipJobStatusUpdate: false,
      });

      if (input.conversationId) {
        await input.writer.from("messages").insert({
          conversation_id: input.conversationId,
          user_id: input.userId,
          role: "assistant",
          content: partialMessage,
          model_id: pr.primaryModelId,
          credits_used: Math.floor(creditsUsed),
          finish_reason: "stop",
          metadata: {
            mode: "build",
            staged: true,
            async: true,
            partial_needs_more_credits: true,
            build_job_id: input.buildJobId,
          } as never,
        });
      }

      await persistBuildJobEvent(input.writer, {
        ...eventCtx,
        type: "partial_credit_stop",
        title: "Saved partial progress",
        detail: partialMessage,
        progressPercent: 100,
        metadata: {
          credits_used: Math.floor(creditsUsed),
          files_persisted: persist.savedCount,
          terminal: "partial_needs_more_credits",
        },
      });

      await logServerOperation({
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        stage: "build",
        event: "async_build_partial_credit_stop",
        status: "ok",
        mode: "build",
        modelId: pr.primaryModelId,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
        operationId: input.operationId,
        metadata: {
          files: persist.savedCount,
          credits_used: Math.floor(creditsUsed),
        },
      });
      buildFinishedSuccess = true;
      return;
    }

    if (
      !buildSucceeded &&
      !input.partialCreditBuild &&
      saveableFileCount >= MIN_RENDERABLE_FILES
    ) {
      await persistStage("persist_started", `${pr.files.length} files in memory`);
      const { result: persist } = await tracePersistGeneratedFiles({
        writer: input.writer,
        projectId: input.projectId,
        ownerId: input.userId,
        files: pr.files,
        operationId: input.operationId,
        executionInstanceId: workerCtx.executionInstanceId,
      });

      const savedCount = Math.max(persist.savedCount, saveableFileCount);
      const postKind = failureKindForPersist({
        fileCount: savedCount,
        repairAttempted: pr.buildContract.failures.some((f) => /ui_quality|repair/i.test(f)),
        previewFailedWithFiles: false,
      });

      await refundBuildReservation({
        writer: input.writer,
        userId: input.userId,
        operationId: input.operationId,
        reservedCredits: input.reservedCredits,
        providerCostUsd: pr.totalProviderCostUsd,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
      });

      const { data: curSaved } = await input.writer
        .from("projects")
        .select("metadata")
        .eq("id", input.projectId)
        .maybeSingle();
      const prevMetaSaved =
        curSaved?.metadata && typeof curSaved.metadata === "object" && !Array.isArray(curSaved.metadata)
          ? (curSaved.metadata as Record<string, unknown>)
          : {};

      await input.writer
        .from("projects")
        .update({
          build_status: "needs_repair",
          metadata: {
            ...prevMetaSaved,
            ...lifecyclePatch("needs_attention", {
              build_contract_failures: pr.buildContract.failures,
              files_ready: true,
              credits_refunded: true,
            }),
            file_count: savedCount,
            ui_quality_score: pr.uiQualityScore,
          } as Json,
        } as never)
        .eq("id", input.projectId)
        .eq("owner_id", input.userId);

      await transitionBuildJobStatus(input.writer, {
        jobId: input.buildJobId,
        ctx: workerCtx,
        toStatus: "failed",
        reason: pr.buildContract.userMessage,
      });

      await finalizeBuildFailed({
        writer: input.writer,
        buildJobId: input.buildJobId,
        projectId: input.projectId,
        userId: input.userId,
        errorMessage: pr.buildContract.userMessage,
        skipJobStatusUpdate: true,
      });

      await persistBuildJobEvent(input.writer, {
        ...eventCtx,
        type: "failed",
        title: userSafeFailureTitle(postKind),
        detail: userSafeFailureDetail(postKind, pr.buildContract.userMessage),
        progressPercent: 100,
        metadata: {
          failures: pr.buildContract.failures,
          failure_kind: postKind,
          file_count: savedCount,
          files_persisted: savedCount,
          execution_instance_id: workerCtx.executionInstanceId,
        },
      });

      await persistBuildJobEvent(input.writer, {
        ...eventCtx,
        type: "refunded",
        title: "Credits were returned",
        detail: "Credits were returned for this attempt.",
        progressPercent: 100,
        metadata: { stream_category: "assistant_message" },
      });

      await logServerOperation({
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        stage: "build",
        event: "async_build_failed",
        status: "error",
        mode: "build",
        modelId: pr.primaryModelId,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
        operationId: input.operationId,
        errorMessage: pr.errorMessage ?? pr.buildContract.userMessage,
        metadata: { failures: pr.buildContract.failures, files_persisted: savedCount },
      });
      return;
    }

    if (!buildSucceeded) {
      await clearGeneratedBuildFiles({
        writer: input.writer,
        projectId: input.projectId,
        ownerId: input.userId,
        buildJobId: input.buildJobId,
        executionInstanceId: workerCtx.executionInstanceId,
        context: "contract_failed_before_persist",
      }).catch(() => undefined);

      await refundBuildReservation({
        writer: input.writer,
        userId: input.userId,
        operationId: input.operationId,
        reservedCredits: input.reservedCredits,
        providerCostUsd: pr.totalProviderCostUsd,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
      });

      const { data: cur } = await input.writer
        .from("projects")
        .select("metadata")
        .eq("id", input.projectId)
        .maybeSingle();
      const prevMeta =
        cur?.metadata && typeof cur.metadata === "object" && !Array.isArray(cur.metadata)
          ? (cur.metadata as Record<string, unknown>)
          : {};

      await input.writer
        .from("projects")
        .update({
          build_status: "needs_repair",
          metadata: {
            ...prevMeta,
            ...lifecyclePatch("needs_attention", {
              build_contract_failures: pr.buildContract.failures,
              credits_refunded: true,
            }),
            file_count: 0,
            ui_quality_score: pr.uiQualityScore,
          } as Json,
        } as never)
        .eq("id", input.projectId)
        .eq("owner_id", input.userId);

      await transitionBuildJobStatus(input.writer, {
        jobId: input.buildJobId,
        ctx: workerCtx,
        toStatus: "failed",
        reason: pr.buildContract.userMessage,
      });

      await finalizeBuildFailed({
        writer: input.writer,
        buildJobId: input.buildJobId,
        projectId: input.projectId,
        userId: input.userId,
        errorMessage: pr.buildContract.userMessage,
        skipJobStatusUpdate: true,
      });

      const preGenKind = failureKindForPersist({
        fileCount: 0,
        repairAttempted: false,
      });
      await persistBuildJobEvent(input.writer, {
        ...eventCtx,
        type: "failed",
        title: userSafeFailureTitle(preGenKind),
        detail: userSafeFailureDetail(preGenKind, pr.buildContract.userMessage),
        progressPercent: 100,
        metadata: {
          failures: pr.buildContract.failures,
          failure_kind: preGenKind,
          file_count: 0,
          execution_instance_id: workerCtx.executionInstanceId,
        },
      });

      await logServerOperation({
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        stage: "build",
        event: "async_build_failed",
        status: "error",
        mode: "build",
        modelId: pr.primaryModelId,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
        operationId: input.operationId,
        errorMessage: pr.errorMessage ?? pr.buildContract.userMessage,
        metadata: { failures: pr.buildContract.failures },
      });
      return;
    }

    await persistStage("persist_started", `${pr.files.length} files in memory`);
    const { result: persist } = await tracePersistGeneratedFiles({
      writer: input.writer,
      projectId: input.projectId,
      ownerId: input.userId,
      files: pr.files,
      operationId: input.operationId,
      executionInstanceId: workerCtx.executionInstanceId,
    });

    await persistStage("persist_completed", `${persist.savedCount} files saved`);
    await persistBuildJobEvent(input.writer, {
      ...eventCtx,
      type: "saving_files",
      title: "Saving files",
      detail: `${persist.savedCount} files saved`,
      progressPercent: 88,
    });

    const fileGate = await assertBuildFilesPersisted({
      writer: input.writer,
      projectId: input.projectId,
      archetypeId: pr.appArchetype,
    });

    if (!persist.ok || persist.savedCount < MIN_RENDERABLE_FILES || !fileGate.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[execute-staged-build] files_persistence_failed", {
          projectId: input.projectId,
          persistOk: persist.ok,
          savedCount: persist.savedCount,
          renderableCount: persist.renderableCount,
          persistError: persist.error,
          fileGateFailures: fileGate.failures,
        });
      }
      await clearGeneratedBuildFiles({
        writer: input.writer,
        projectId: input.projectId,
        ownerId: input.userId,
        buildJobId: input.buildJobId,
        executionInstanceId: workerCtx.executionInstanceId,
        context: "contract_failed_before_persist",
      }).catch(() => undefined);

      await refundBuildReservation({
        writer: input.writer,
        userId: input.userId,
        operationId: input.operationId,
        reservedCredits: input.reservedCredits,
        providerCostUsd: pr.totalProviderCostUsd,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
      });

      const failDetail =
        fileGate.failures.join("; ") ||
        persist.error ||
        "files_persistence_failed";

      await transitionBuildJobStatus(input.writer, {
        jobId: input.buildJobId,
        ctx: workerCtx,
        toStatus: "failed",
        reason: failDetail,
      });

      await finalizeBuildFailed({
        writer: input.writer,
        buildJobId: input.buildJobId,
        projectId: input.projectId,
        userId: input.userId,
        errorMessage: failDetail,
        skipJobStatusUpdate: true,
      });

      const persistFailKind = failureKindForPersist({
        fileCount: 0,
        repairAttempted: false,
      });
      await persistBuildJobEvent(input.writer, {
        ...eventCtx,
        type: "failed",
        title: userSafeFailureTitle(persistFailKind),
        detail: userSafeFailureDetail(
          persistFailKind,
          fileGate.code ?? "files_persistence_failed",
        ),
        progressPercent: 100,
        metadata: {
          failures: fileGate.failures,
          persist_error: persist.error,
          failure_kind: persistFailKind,
          file_count: 0,
        },
      });
      return;
    }

    await persistStage("preview_started");
    const previewResult = await startPreviewSession({
      writer: input.writer,
      userId: input.userId,
      projectId: input.projectId,
    });

    if (!previewResult.ok) {
      const previewErr = previewResult.error ?? "Preview could not be prepared.";
      const userMessage =
        "Your app files are ready. Preview needs a quick repair.";

      const { data: cur } = await input.writer
        .from("projects")
        .select("metadata")
        .eq("id", input.projectId)
        .maybeSingle();
      const prevMeta =
        cur?.metadata && typeof cur.metadata === "object" && !Array.isArray(cur.metadata)
          ? (cur.metadata as Record<string, unknown>)
          : {};

      await input.writer
        .from("projects")
        .update({
          build_status: "preview_failed",
          metadata: {
            ...prevMeta,
            ...lifecyclePatch("needs_attention", {
              files_ready: true,
              files_ready_preview_failed: true,
              preview_error: previewErr,
              preview_error_code: previewResult.code,
              file_count: fileGate.fileCount,
            }),
            file_count: fileGate.fileCount,
            ui_quality_score: pr.uiQualityScore,
          } as Json,
        } as never)
        .eq("id", input.projectId)
        .eq("owner_id", input.userId);

      await transitionBuildJobStatus(input.writer, {
        jobId: input.buildJobId,
        ctx: workerCtx,
        toStatus: "failed",
        reason: previewErr,
      });

      await persistBuildJobEvent(input.writer, {
        ...eventCtx,
        type: "validating_preview",
        title: "Preview needs a quick repair",
        detail: userMessage,
        progressPercent: 95,
        metadata: {
          preview_failed: true,
          files_kept: fileGate.fileCount,
          code: previewResult.code,
          execution_instance_id: workerCtx.executionInstanceId,
        },
      });

      if (!alreadyCharged && input.reservedCredits && input.reservedCredits > 0) {
        const chargeCalc = calculateCreditsForStagedBuild({
          providerCostUsd: pr.totalProviderCostUsd,
          complexity: pr.complexity,
          inputTokens: pr.totalInputTokens,
          outputTokens: pr.totalOutputTokens,
          primaryModelId: pr.primaryModelId,
          fileCount: fileGate.fileCount,
        });
        const profitable = assertProfitableCharge(
          chargeCalc.creditsToCharge,
          chargeCalc.estimatedProviderCostUsd,
        );
        if (profitable.ok) {
          await reconcileGenerationReservation(input.writer, {
            userId: input.userId,
            generationId: input.operationId,
            reservedCredits: input.reservedCredits,
            actualUserCredits: Math.min(input.reservedCredits, chargeCalc.creditsToCharge),
            providerCostUsd: chargeCalc.estimatedProviderCostUsd,
            success: true,
            projectId: input.projectId,
          });
        }
      }

      await logServerOperation({
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        stage: "build",
        event: "preview_failed_files_kept",
        status: "error",
        mode: "build",
        modelId: pr.primaryModelId,
        projectId: input.projectId,
        buildJobId: input.buildJobId,
        operationId: input.operationId,
        errorMessage: previewErr,
        metadata: { code: previewResult.code, files_kept: fileGate.fileCount },
      });
      return;
    }

    const iconApiUrl =
      pr.iconUrl ?? `${getAppUrl().replace(/\/$/, "")}/api/projects/${input.projectId}/icon`;

    await input.writer
      .from("projects")
      .update({
        app_icon_url: pr.iconSvg,
        icon_url: pr.iconUrl ?? iconApiUrl,
        app_name: pr.appName.slice(0, 80),
      } as never)
      .eq("id", input.projectId)
      .eq("owner_id", input.userId);

    await persistStage("preview_completed", previewResult.previewUrl ?? "ready");

    await transitionBuildJobStatus(input.writer, {
      jobId: input.buildJobId,
      ctx: workerCtx,
      toStatus: "completed",
      reason: "preview_ready",
    });

    await finalizeBuildSuccess({
      writer: input.writer,
      userId: input.userId,
      projectId: input.projectId,
      buildJobId: input.buildJobId,
      appName: pr.appName,
      appSlug: pr.meta?.app?.slug ?? null,
      appDescription: pr.meta?.app?.description ?? null,
      iconSvg: pr.iconSvg,
      meta: pr.meta,
      fileCount: fileGate.fileCount,
      creditsCharged: 0,
      charged: false,
      skipJobStatusUpdate: true,
    });

    let creditsCharged = 0;
    if (!alreadyCharged && input.reservedCredits && input.reservedCredits > 0) {
      const chargeCalc = calculateCreditsForStagedBuild({
        providerCostUsd: pr.totalProviderCostUsd,
        complexity: pr.complexity,
        inputTokens: pr.totalInputTokens,
        outputTokens: pr.totalOutputTokens,
        primaryModelId: pr.primaryModelId,
        fileCount: fileGate.fileCount,
      });

      const profitable = assertProfitableCharge(
        chargeCalc.creditsToCharge,
        chargeCalc.estimatedProviderCostUsd,
      );

      if (profitable.ok) {
        const recon = await reconcileGenerationReservation(input.writer, {
          userId: input.userId,
          generationId: input.operationId,
          reservedCredits: input.reservedCredits,
          actualUserCredits: Math.min(input.reservedCredits, chargeCalc.creditsToCharge),
          providerCostUsd: chargeCalc.estimatedProviderCostUsd,
          success: true,
          projectId: input.projectId,
        });
        creditsCharged = recon.finalCharged;

        await finalizeBuildSuccess({
          writer: input.writer,
          userId: input.userId,
          projectId: input.projectId,
          buildJobId: input.buildJobId,
          appName: pr.appName,
          appSlug: pr.meta?.app?.slug ?? null,
          appDescription: pr.meta?.app?.description ?? null,
          iconSvg: pr.iconSvg,
          meta: pr.meta,
          fileCount: fileGate.fileCount,
          creditsCharged: recon.finalCharged,
          charged: true,
          skipJobStatusUpdate: true,
        });
      }
    }

    const doneSummary =
      pr.meta?.summary?.trim() ||
      `Done — ${pr.appName} is ready to preview with ${fileGate.fileCount} files.`;
    await persistAssistantBuildMessage(input.writer, eventCtx, {
      message: doneSummary.slice(0, 280),
      progressPercent: 98,
    });

    await persistBuildJobEvent(input.writer, {
      ...eventCtx,
      type: "completed",
      title: "Preview ready",
      detail: previewResult.previewUrl
        ? `${pr.meta?.summary ?? `Built ${pr.appName}`} — preview live`
        : pr.meta?.summary ?? `Built ${pr.appName}`,
      progressPercent: 100,
      metadata: {
        credits_charged: creditsCharged,
        preview_url: previewResult.previewUrl ?? null,
        files_persisted: fileGate.fileCount,
        stream_category: "completed",
      },
    });

    await logServerOperation({
      writer: input.writer,
      userId: input.userId,
      userEmail: input.userEmail,
      stage: "build",
      event: "async_build_success",
      status: "ok",
      mode: "build",
      modelId: pr.primaryModelId,
      projectId: input.projectId,
      buildJobId: input.buildJobId,
      operationId: input.operationId,
      metadata: {
        files: fileGate.fileCount,
        credits_charged: creditsCharged,
        preview_url: previewResult.previewUrl ?? null,
      },
    });
    await persistStage("job_completed");
    buildFinishedSuccess = true;
  } catch (err) {
    await writeWorkerStallSnapshot({
      buildJobId: input.buildJobId,
      projectId: input.projectId,
      operationId: input.operationId,
      trace: getBuildWorkerTrace(input.buildJobId),
    }).catch(() => undefined);
    const normalized = normalizeBuildError(err, {
      stage: "build_pipeline",
      operationId: input.operationId,
      projectId: input.projectId,
      mode: "build",
      modelId: input.modelId,
    });

    await persistStage("job_failed", normalized.userMessage).catch(() => undefined);

    if (!jobClaimed) return;

    await refundBuildReservation({
      writer: input.writer,
      userId: input.userId,
      operationId: input.operationId,
      reservedCredits: input.reservedCredits,
      providerCostUsd: 0,
      projectId: input.projectId,
      buildJobId: input.buildJobId,
    }).catch(() => undefined);

    await transitionBuildJobStatus(input.writer, {
      jobId: input.buildJobId,
      ctx: workerCtx,
      toStatus: "failed",
      reason: normalized.userMessage,
    }).catch(() => undefined);

    await finalizeBuildFailed({
      writer: input.writer,
      buildJobId: input.buildJobId,
      projectId: input.projectId,
      userId: input.userId,
      errorMessage: normalized.userMessage,
      skipJobStatusUpdate: true,
    }).catch(() => undefined);

    await persistBuildJobEvent(input.writer, {
      ...eventCtx,
      type: "failed",
      title: "Build failed",
      detail: normalized.userMessage,
      progressPercent: 100,
      metadata: {
        code: normalized.code,
        retryable: normalized.retryable,
        execution_instance_id: workerCtx.executionInstanceId,
      },
    });

    await logServerOperation({
      writer: input.writer,
      userId: input.userId,
      userEmail: input.userEmail,
      stage: "build",
      event: "async_build_crash",
      status: "error",
      mode: "build",
      modelId: input.modelId,
      projectId: input.projectId,
      buildJobId: input.buildJobId,
      operationId: input.operationId,
      errorMessage: normalized.message,
      metadata: { code: normalized.code, stage: normalized.stage },
    });
  } finally {
    clearInterval(heartbeat);
    setTraceHeartbeatRunning(trace, false);
    clearBuildWorkerTrace(input.buildJobId);
    inFlightBuildJobs.delete(input.buildJobId);
  }
}
