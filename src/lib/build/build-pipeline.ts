import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { scoreTaskScope } from "@/lib/ai/task-scope-limiter";
import {
  buildIntakeFromPrompt,
  processHugePromptIntake,
  resolveHeavyExecutionBrief,
  type HugePromptIntakeResult,
} from "@/lib/ai/huge-prompt-intake";
import {
  createBuildContextSlices,
  HeavyInputBudgetTracker,
  type BuildContextSlices,
} from "@/lib/build/heavy-input-budget";
import { loadBuildBacklog } from "@/lib/build/build-backlog";
import {
  formatBuildResultSummary,
  renderBuildResultMarkdown,
} from "@/lib/build/build-continuation-plan";
import { FULL_BUILD_CAP_USD } from "@/lib/ai/cost-budget";
import { callProviderStructured, parseJsonFromModel } from "@/lib/ai/provider-call";
import { parseBuildFilesFromModel } from "@/lib/build/parse-build-files";
import {
  countRenderablePages,
  filterRenderableBuildFiles,
  hasRouteFiles,
  type BuildFile,
} from "@/lib/build/generated-file-utils";
import type { BuildSuccessContractResult } from "@/lib/build/build-success-contract";
import {
  enforcePostBuildContractWithRepair,
  requiredPageSlugsForArchetype,
} from "@/lib/build/post-build-contract";
import {
  applyArchetypeScaffoldFallback,
  hasFullScaffoldTree,
} from "@/lib/build/archetype-scaffold-fallback";
import {
  buildDeterministicPlanForArchetype,
  deterministicPlanToJson,
  hasDeterministicArchetypePlan,
} from "@/lib/build/deterministic-archetype-plan";
import { callProviderWithBuildTimeout, withTimeout } from "@/lib/build/timed-build-operations";
import { normalizeAppRouterBuildFiles } from "@/lib/build/app-router-route-normalizer";
import { countThinFiles } from "@/lib/build/meaningful-file-guard";
import { resolveModelMix } from "@/lib/ai/model-mix-router";
import type {
  BuildWorkerTraceSnapshot,
  BuildWorkerTraceStage,
} from "@/lib/build/build-worker-trace";
import {
  persistTraceStage,
  traceBuildWorkerStage,
} from "@/lib/build/build-worker-trace";
import { PROVIDER_TIMEOUT_MS } from "@/lib/ai/provider-timeouts";
import { appIconSvgDataUrl } from "@/lib/creation/app-icon-svg";
import { resolveModelRuntime } from "@/lib/ai/model-catalog";
import { logServerOperation } from "@/lib/ops/server-ops-log";
import { requireId } from "@/lib/diagnostics/require-ids";
import { dreamosLog } from "@/lib/diagnostics/dreamos-logger";
import {
  createAppIdentityForBuild,
  type AppIdentityResult,
} from "@/lib/projects/app-identity-service";
import type { BuilderOutputContract } from "@/lib/creation/parse-builder-metadata";
import { slugifyAppName } from "@/lib/creation/parse-builder-metadata";
import { validateGeneratedBuild } from "@/lib/creation/validate-build-quality";
import { assessBuildQuality, buildRepairPrompt } from "@/lib/build/quality-repair";
import {
  classifyAppArchetype,
  archetypeToLegacyAppType,
} from "@/lib/build/app-archetype-classifier";
import { buildDesignBrief, type DesignBrief } from "@/lib/build/design-brief-generator";
import { checkGeneratedUiQuality, previewReadyMinScore } from "@/lib/build/generated-ui-quality-checker";
import { buildPremiumUiRepairPrompt } from "@/lib/build/generated-ui-repair-pass";
import {
  backendPrompt,
  buildPlanPrompt,
  frontendPrompt,
  minimalFrontendPrompt,
  schemaPrompt,
  uiPlanPrompt,
} from "@/lib/build/stage-prompts";
import { computeFileLineMeta, type FileLineMeta } from "@/lib/build/file-line-counts";
import {
  userFacingArchetypeLabel,
  userFacingRepairPassLabel,
} from "@/lib/workflow/user-facing-workflow-events";

export type WorkflowEventType =
  | "thinking"
  | "classified"
  | "planning"
  | "identity"
  | "icon"
  | "schema"
  | "designing"
  | "reading"
  | "writing"
  | "editing"
  | "validating"
  | "compiling"
  | "repairing"
  | "saving"
  | "charging"
  | "finalizing"
  | "done"
  | "failed";

export type WorkflowEventMeta = {
  filePath?: string;
  fileLineMeta?: import("@/lib/build/file-line-counts").FileLineMeta;
  streamCategory?: string;
};

export type WorkflowEvent = {
  type: WorkflowEventType;
  label: string;
  detail?: string;
  at: string;
  meta?: WorkflowEventMeta;
};

export type StagedBuildResult = {
  ok: boolean;
  visibleText: string;
  meta: BuilderOutputContract | null;
  iconSvg: string | null;
  iconUrl: string | null;
  appName: string;
  files: BuildFile[];
  events: WorkflowEvent[];
  totalProviderCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  primaryModelId: string;
  complexity: number;
  uiQualityScore: number;
  buildContract: BuildSuccessContractResult;
  /** Full post-build contract failures (includes ui_quality, routes, imports). */
  postBuildFailures: string[];
  appArchetype: string;
  errorMessage?: string;
  scaffoldFallbackUsed?: boolean;
  scaffoldFallbackReason?: string;
  filesBeforeScaffoldFallback?: number;
  filesAfterScaffoldFallback?: number;
  partialCreditStop?: boolean;
};

type Writer = SupabaseClient<Database>;

const BUILD_SYSTEM = `You are DreamOS86 build engine. Output strict JSON only when asked. Never exceed token limits.`;

function appendWorkflowEvent(
  events: WorkflowEvent[],
  type: WorkflowEventType,
  label: string,
  detail?: string,
  onWorkflowEvent?: (ev: WorkflowEvent) => void | Promise<void>,
  meta?: WorkflowEventMeta,
) {
  const row: WorkflowEvent = {
    type,
    label,
    detail,
    at: new Date().toISOString(),
    meta,
  };
  events.push(row);
  void onWorkflowEvent?.(row);
}

function trackAssistant(
  events: WorkflowEvent[],
  message: string,
  onWorkflowEvent?: (ev: WorkflowEvent) => void | Promise<void>,
) {
  appendWorkflowEvent(events, "thinking", message, undefined, onWorkflowEvent, {
    streamCategory: "assistant_message",
  });
}

function mergeIncomingBuildFiles(
  existing: BuildFile[],
  incoming: BuildFile[],
  events: WorkflowEvent[],
  trackFn: (
    events: WorkflowEvent[],
    type: WorkflowEventType,
    label: string,
    detail?: string,
    meta?: WorkflowEventMeta,
  ) => void,
  maxFiles: number,
): BuildFile[] {
  const merged = new Map(existing.map((f) => [f.path, f]));
  for (const f of filterRenderableBuildFiles(incoming)) {
    const prev = merged.get(f.path);
    const fileLineMeta = computeFileLineMeta(prev?.content, f.content);
    const path = f.path;
    const meta: WorkflowEventMeta = {
      filePath: path,
      ...(fileLineMeta ? { fileLineMeta } : {}),
    };
    if (prev) {
      trackFn(events, "editing", `Updated ${path}`, path, meta);
    } else {
      trackFn(events, "writing", `Created ${path}`, path, meta);
    }
    merged.set(f.path, f);
  }
  return [...merged.values()].slice(0, maxFiles);
}

function parseFilePayload(text: string) {
  return parseBuildFilesFromModel(text);
}

function buildVisibleNarrative(
  meta: BuilderOutputContract | null,
  workflow: WorkflowEvent[],
  summary: string,
  savedFiles: BuildFile[],
): string {
  const planSteps = meta?.plan ?? meta?.build_plan?.map((p) => p.title) ?? [];
  const lines: string[] = [];

  lines.push("```dreamos-app-meta");
  lines.push(JSON.stringify(meta ?? { summary }, null, 0));
  lines.push("```");
  lines.push("");

  if (planSteps.length) {
    lines.push("## [planning] Build plan");
    for (const s of planSteps.slice(0, 6)) {
      const label = typeof s === "string" ? s : "Step";
      lines.push(`- ${label}`);
    }
    lines.push("");
  }

  for (const ev of workflow.filter((e) => ["writing", "editing", "validating", "repairing", "saving"].includes(e.type))) {
    lines.push(`- ${ev.label}`);
  }

  if (savedFiles.length > 0) {
    lines.push("");
    lines.push("Files saved:");
    for (const f of savedFiles.slice(0, 14)) {
      lines.push(`- ${f.path}`);
    }
    if (savedFiles.length > 14) lines.push(`- …and ${savedFiles.length - 14} more`);
  }

  lines.push("");
  lines.push(summary.slice(0, 600));

  return lines.join("\n");
}

export async function runStagedBuildPipeline(input: {
  writer: Writer;
  userId: string;
  userEmail: string | null;
  operationId: string;
  projectId: string;
  buildJobId: string | null;
  userPrompt: string;
  memoryBlock?: string;
  blueprintBlock?: string;
  conversationId?: string | null;
  userSelectedModelId?: string | null;
  onWorkflowEvent?: (ev: WorkflowEvent) => void | Promise<void>;
  buildTrace?: BuildWorkerTraceSnapshot | null;
  /** When true, pipeline may return early with files saved for partial credit builds. */
  shouldStopForCredits?: () => boolean;
}): Promise<StagedBuildResult> {
  const emit = input.onWorkflowEvent;
  const track = (
    events: WorkflowEvent[],
    type: WorkflowEventType,
    label: string,
    detail?: string,
    meta?: WorkflowEventMeta,
  ) => appendWorkflowEvent(events, type, label, detail, emit, meta);
  if (!requireId("projectId", input.projectId, { source: "server", userId: input.userId, buildId: input.buildJobId })) {
    dreamosLog({
      source: "server",
      category: "missing_id",
      severity: "error",
      message: "Staged build aborted — missing projectId",
      userId: input.userId,
      buildId: input.buildJobId,
    });
    return {
      ok: false,
      visibleText: "Build failed: project ID is missing.",
      meta: null,
      iconSvg: null,
      files: [],
      events: [],
      totalProviderCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      primaryModelId: "automatic",
      complexity: 1,
      errorMessage: "missing_project_id",
      iconUrl: null,
      appName: "Dream App",
      uiQualityScore: 0,
      buildContract: {
        passed: false,
        allowed: false,
        failures: ["missing_project_id"],
        renderableCount: 0,
        pageCount: 0,
        uiQualityScore: 0,
        previewReady: false,
        userMessage: "Build failed.",
      },
      appArchetype: "unknown",
      postBuildFailures: ["missing_project_id"],
    };
  }

  const events: WorkflowEvent[] = [];
  let accumulatedCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  let primaryModelId = "gpt-5.4-mini";

  const archetypeEarly = classifyAppArchetype(input.userPrompt);
  const knownArchetypeFastPath = hasDeterministicArchetypePlan(archetypeEarly.id);

  const tracePersist = async (stage: BuildWorkerTraceStage, detail?: string) => {
    if (!input.buildTrace || !input.buildJobId) return;
    await persistTraceStage(input.writer, {
      jobId: input.buildJobId,
      projectId: input.projectId,
      userId: input.userId,
      snap: input.buildTrace,
      stage,
      detail,
    }).catch(() => undefined);
  };

  if (input.buildTrace) {
    traceBuildWorkerStage(input.buildTrace, "preflight_started");
    await tracePersist("preflight_started");
  }

  let intakeResult: HugePromptIntakeResult | null = null;
  if (knownArchetypeFastPath) {
    intakeResult = buildIntakeFromPrompt(input.userPrompt);
  } else {
    try {
      const intakeRace = await withTimeout(
        processHugePromptIntake({
          writer: input.writer,
          userId: input.userId,
          userEmail: input.userEmail,
          projectId: input.projectId,
          operationId: input.operationId,
          rawPrompt: input.userPrompt,
          userSelectedModelId: input.userSelectedModelId,
        }),
        PROVIDER_TIMEOUT_MS.build_intake ?? 30_000,
        "build_intake",
      );
      if (intakeRace.ok) {
        intakeResult = intakeRace.value;
        accumulatedCost += intakeResult.intakeProviderCostUsd;
      } else {
        intakeResult = buildIntakeFromPrompt(input.userPrompt);
      }
    } catch {
      intakeResult = buildIntakeFromPrompt(input.userPrompt);
    }
  }

  if (input.buildTrace) {
    traceBuildWorkerStage(input.buildTrace, "preflight_completed");
  }

  const executionPrompt = resolveHeavyExecutionBrief(input.userPrompt, intakeResult);
  const firstPassScope = intakeResult?.firstPassScope;
  const heavyBudget = new HeavyInputBudgetTracker();

  const scope = scoreTaskScope(executionPrompt);
  const effectiveComplexity = firstPassScope?.complexity ?? scope.complexity;
  const effectiveMaxFiles = firstPassScope?.maxFiles ?? scope.maxFiles;

  const primaryMix = resolveModelMix({
    operationType: "frontend_implementation",
    userSelectedModelId: input.userSelectedModelId,
    complexity: effectiveComplexity,
    ownerEmail: input.userEmail,
  });
  primaryModelId = primaryMix.mainModelId;

  track(
    events,
    "classified",
    `Complexity ${effectiveComplexity}/10`,
    firstPassScope ? `First pass (${firstPassScope.tier})` : scope.coreV1Only ? "Core V1 first" : undefined,
  );
  trackAssistant(events, userFacingArchetypeLabel(archetypeEarly.label), emit);

  const scopeNote = firstPassScope
    ? firstPassScope.scopeNote
    : scope.coreV1Only
      ? `Build Core V1 only. Queue for later: ${scope.backlog.slice(0, 5).join("; ")}`
      : "";

  let contextSlices: BuildContextSlices = createBuildContextSlices(
    executionPrompt,
    scopeNote,
    input.operationId,
  );

  const planContext = [input.blueprintBlock, input.memoryBlock, scopeNote].filter(Boolean).join("\n\n");

  const archetype = archetypeEarly;
  let deterministicPlanUsed = knownArchetypeFastPath;
  let planJson = "";
  let planParsed = buildDeterministicPlanForArchetype(archetype, executionPrompt);

  if (knownArchetypeFastPath) {
    const det = buildDeterministicPlanForArchetype(archetype, executionPrompt);
    planParsed = det;
    planJson = deterministicPlanToJson(det);
    track(events, "planning", "Creating the app structure…");
    if (input.buildTrace) {
      traceBuildWorkerStage(input.buildTrace, "deterministic_plan_fallback_used", archetype.id);
      await tracePersist("deterministic_plan_fallback_used", archetype.id);
    }
  } else {
    track(events, "planning", "Designing routes and screens");
  }

  if (!knownArchetypeFastPath) {
    const planPrompt = buildPlanPrompt(executionPrompt, planContext, contextSlices);
    heavyBudget.record([planPrompt, BUILD_SYSTEM]);
    heavyBudget.assertWithinBudget();
    const planCall = await callProviderWithBuildTimeout(
      {
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        operationId: `${input.operationId}:plan`,
        operationType: "build_plan",
        system: BUILD_SYSTEM,
        prompt: planPrompt,
        accumulatedCostUsd: accumulatedCost,
        userSelectedModelId: input.userSelectedModelId,
        timeoutMs: PROVIDER_TIMEOUT_MS.build_plan,
      },
      input.buildTrace,
    );
    if (planCall.ok) {
      accumulatedCost += planCall.result.providerCostUsd;
      totalIn += planCall.result.inputTokens ?? 0;
      totalOut += planCall.result.outputTokens ?? 0;
      primaryModelId = planCall.result.spec.modelId;
      planJson = planCall.result.text;
      const parsedPlan = parseJsonFromModel<typeof planParsed>(planJson);
      if (parsedPlan) planParsed = { ...planParsed, ...parsedPlan };
    } else {
      deterministicPlanUsed = true;
      const det = buildDeterministicPlanForArchetype(archetype, executionPrompt);
      planParsed = det;
      planJson = deterministicPlanToJson(det);
      track(events, "planning", "Creating the app structure…");
      if (input.buildTrace) {
        traceBuildWorkerStage(input.buildTrace, "deterministic_plan_fallback_used", "planner_timeout");
      }
    }
  }

  if (!planJson) planJson = deterministicPlanToJson(planParsed);
  contextSlices = createBuildContextSlices(executionPrompt, scopeNote, input.operationId, planJson);
  const llmPlan = parseJsonFromModel<typeof planParsed>(planJson);
  if (llmPlan && !deterministicPlanUsed) planParsed = { ...planParsed, ...llmPlan };
  else if (llmPlan && knownArchetypeFastPath) planParsed = { ...planParsed, ...llmPlan };

  const complexity = Math.min(10, planParsed?.complexity ?? effectiveComplexity);

  const fallbackAppName = archetype.id === "restaurant_inventory" ? "Pantry Pro" : "Dream App";
  const identityFallback: AppIdentityResult = {
    appName: fallbackAppName,
    slug: slugifyAppName(fallbackAppName),
    shortDescription: planParsed?.summary ?? "",
    category: archetype.id === "restaurant_inventory" ? "restaurant" : "productivity",
    namingConfidence: 0.5,
    namingSource: "fallback",
    iconSvg: appIconSvgDataUrl(fallbackAppName),
    iconUrl: null,
    logoAssets: {},
    logoGenerationStatus: "skipped",
    logoGenerationError: null,
    logoGenerationActionCreditCost: 0,
    logoGenerationOperationId: input.operationId,
    reused: false,
  };

  track(events, "identity", "Creating app identity");
  if (input.buildTrace) traceBuildWorkerStage(input.buildTrace, "identity_started");
  const identityTimed = await withTimeout(
    createAppIdentityForBuild({
      writer: input.writer,
      userId: input.userId,
      userEmail: input.userEmail,
      projectId: input.projectId,
      buildOperationId: input.operationId,
      buildIntent: executionPrompt,
      planSummary: planParsed?.summary ?? planJson.slice(0, 800),
      categoryHint: planParsed?.entities?.[0] ? String(planParsed.entities[0]) : undefined,
      userSelectedModelId: input.userSelectedModelId,
      onProgress: (step) => track(events, "identity", step),
      skipLogo: false,
    }),
    PROVIDER_TIMEOUT_MS.app_identity ?? 45_000,
    "app_identity",
  );
  const identityResult = identityTimed.ok ? identityTimed.value : identityFallback;
  if (input.buildTrace) {
    traceBuildWorkerStage(
      input.buildTrace,
      identityTimed.ok ? "identity_completed" : "identity_failed",
    );
  }

  const appName = identityResult.appName;
  const appSlug = identityResult.slug;
  const category = identityResult.category;
  let iconSvg = identityResult.iconSvg;
  if (!identityResult.iconUrl && !(iconSvg && iconSvg.startsWith("<svg"))) {
    iconSvg = appIconSvgDataUrl(appName);
  }
  if (identityResult.userNotice) {
    track(events, "icon", identityResult.userNotice);
  }

  track(events, "classified", `Archetype: ${archetype.label}`);
  const designBrief: DesignBrief = buildDesignBrief({
    buildIntent: executionPrompt,
    archetype,
    appName,
    planSummary: planParsed?.summary,
    planPages: planParsed?.pages?.map(String),
  });
  track(events, "designing", "Creating design brief");

  const { data: projMetaRow } = await input.writer
    .from("projects")
    .select("metadata")
    .eq("id", input.projectId)
    .maybeSingle();
  const prevMeta =
    projMetaRow?.metadata && typeof projMetaRow.metadata === "object" && !Array.isArray(projMetaRow.metadata)
      ? (projMetaRow.metadata as Record<string, unknown>)
      : {};
  await input.writer
    .from("projects")
    .update({
      metadata: {
        ...prevMeta,
        app_archetype: archetype.id,
        app_type: archetypeToLegacyAppType(archetype.id),
        design_brief_routes: designBrief.routes,
        blueprint_routes: designBrief.routes,
        last_preview_session_id: null,
        preview_ready: false,
        preview_honest: false,
      } as Json,
    } as never)
    .eq("id", input.projectId)
    .eq("owner_id", input.userId);

  let schemaJson: string;
  let uiJson: string;

  if (knownArchetypeFastPath || deterministicPlanUsed) {
    schemaJson = JSON.stringify({ entities: planParsed?.entities ?? [] });
    uiJson = JSON.stringify({ routes: archetype.coreRoutes, pages: planParsed?.pages ?? [] });
    track(events, "designing", "Planning UI structure");
  } else {
    track(events, "schema", "Designing data schema");
    const schemaPromptText = schemaPrompt(planJson!, contextSlices);
    heavyBudget.record([schemaPromptText, BUILD_SYSTEM]);
    const schemaCall = await callProviderWithBuildTimeout(
      {
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        operationId: `${input.operationId}:schema`,
        operationType: "schema_design",
        system: BUILD_SYSTEM,
        prompt: schemaPromptText,
        complexity,
        accumulatedCostUsd: accumulatedCost,
        timeoutMs: PROVIDER_TIMEOUT_MS.schema_design,
      },
      input.buildTrace,
    );
    if (schemaCall.ok) {
      accumulatedCost += schemaCall.result.providerCostUsd;
      schemaJson = schemaCall.result.text;
    } else {
      schemaJson = JSON.stringify({ entities: planParsed?.entities ?? [] });
    }
    contextSlices = createBuildContextSlices(
      executionPrompt,
      scopeNote,
      input.operationId,
      planJson!,
      schemaJson,
    );

    track(events, "designing", "Planning UI structure");
    const uiPromptText = uiPlanPrompt(planJson!, schemaJson, executionPrompt, contextSlices, designBrief);
    heavyBudget.record([uiPromptText, BUILD_SYSTEM]);
    const uiCall = await callProviderWithBuildTimeout(
      {
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        operationId: `${input.operationId}:ui`,
        operationType: "ui_design_plan",
        system: BUILD_SYSTEM,
        prompt: uiPromptText,
        complexity,
        accumulatedCostUsd: accumulatedCost,
        userSelectedModelId: input.userSelectedModelId,
        timeoutMs: PROVIDER_TIMEOUT_MS.ui_design_plan,
      },
      input.buildTrace,
    );
    if (uiCall.ok) {
      accumulatedCost += uiCall.result.providerCostUsd;
      uiJson = uiCall.result.text;
    } else {
      uiJson = JSON.stringify({ routes: archetype.coreRoutes });
    }
  }
  contextSlices = createBuildContextSlices(
    executionPrompt,
    scopeNote,
    input.operationId,
    planJson,
    schemaJson,
    uiJson,
  );

  const entityHint =
    planParsed?.entities?.length && planParsed.entities.length > 0
      ? String(planParsed.entities.slice(0, 3).join(", "))
      : archetype.label;
  trackAssistant(
    events,
    `Data model and routes are set (${entityHint}) — I'll generate screens and components next.`,
    emit,
  );

  if (accumulatedCost >= FULL_BUILD_CAP_USD * 0.85) {
    return {
      ok: false,
      visibleText: "This build is too large for one pass. I staged the core plan — continue with a follow-up prompt for the next features.",
      meta: null,
      iconSvg: iconSvg || null,
      iconUrl: identityResult.iconUrl,
      appName,
      files: [],
      events,
      totalProviderCostUsd: accumulatedCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      primaryModelId,
      complexity,
      uiQualityScore: 0,
      buildContract: {
        passed: false,
        allowed: false,
        failures: ["build_budget_precheck"],
        renderableCount: 0,
        pageCount: 0,
        uiQualityScore: 0,
        previewReady: false,
        userMessage: "This build is too large for one pass — try a smaller scope or continue in a follow-up prompt.",
      },
      errorMessage: "build_budget_precheck",
      appArchetype: archetype.id,
      postBuildFailures: ["build_budget_precheck"],
    };
  }

  trackAssistant(
    events,
    `I'm writing the core screens and components for ${appName} now.`,
    emit,
  );
  track(events, "writing", "Adding the required pages…");
  if (input.buildTrace) traceBuildWorkerStage(input.buildTrace, "file_generation_started");

  const smokeBuild = process.env.DREAMOS_SMOKE_BUILD === "1";
  const RESTAURANT_MIN_SCAFFOLD_FILES = 16;
  let allFiles: BuildFile[] = [];

  if (hasFullScaffoldTree(archetype.id)) {
    const preScaffold = applyArchetypeScaffoldFallback(archetype.id, [], appName);
    allFiles = preScaffold.files;
    if (input.buildTrace) {
      traceBuildWorkerStage(input.buildTrace, "scaffold_fallback_applied", String(preScaffold.afterCount));
    }
  }

  const scaffoldSufficient =
    knownArchetypeFastPath &&
    hasFullScaffoldTree(archetype.id) &&
    filterRenderableBuildFiles(allFiles).length >= RESTAURANT_MIN_SCAFFOLD_FILES;

  if (!scaffoldSufficient) {
    track(events, "writing", "Generating frontend files");
    const fePrompt = smokeBuild
      ? minimalFrontendPrompt(executionPrompt, planJson!, contextSlices, designBrief)
      : frontendPrompt(executionPrompt, planJson!, uiJson, effectiveMaxFiles, contextSlices, designBrief);
    heavyBudget.record([fePrompt, BUILD_SYSTEM]);
    heavyBudget.assertWithinBudget(true);
    const feCall = await callProviderWithBuildTimeout(
      {
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        operationId: `${input.operationId}:frontend`,
        operationType: "frontend_implementation",
        system: BUILD_SYSTEM,
        prompt: fePrompt,
        complexity: smokeBuild ? 3 : complexity,
        accumulatedCostUsd: accumulatedCost,
        userSelectedModelId: input.userSelectedModelId,
        timeoutMs: scaffoldSufficient ? 8_000 : PROVIDER_TIMEOUT_MS.frontend_implementation,
      },
      input.buildTrace,
    );
    if (feCall.ok) {
      accumulatedCost += feCall.result.providerCostUsd;
      totalIn += feCall.result.inputTokens ?? 0;
      totalOut += feCall.result.outputTokens ?? 0;
      primaryModelId = feCall.result.spec.modelId;
      const fePayload = parseFilePayload(feCall.result.text);
      if (fePayload.files.length) {
        const beforeCount = allFiles.length;
        allFiles = mergeIncomingBuildFiles(
          allFiles,
          fePayload.files,
          events,
          track,
          effectiveMaxFiles,
        );
        if (allFiles.length > beforeCount) {
          trackAssistant(
            events,
            `Generated ${allFiles.length - beforeCount} file${allFiles.length - beforeCount === 1 ? "" : "s"} — checking quality next.`,
            emit,
          );
        }
      }
    }
  } else if (input.buildTrace) {
    traceBuildWorkerStage(
      input.buildTrace,
      "scaffold_fallback_applied",
      String(filterRenderableBuildFiles(allFiles).length),
    );
  }

  if (!hasRouteFiles(allFiles) && accumulatedCost < FULL_BUILD_CAP_USD * 0.92) {
    track(events, "writing", "Retrying with compact route set");
    const miniCall = await callProviderWithBuildTimeout(
      {
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        operationId: `${input.operationId}:frontend-mini`,
        operationType: "frontend_implementation",
        system: BUILD_SYSTEM,
        prompt: minimalFrontendPrompt(executionPrompt, planJson, contextSlices, designBrief),
        complexity: 4,
        accumulatedCostUsd: accumulatedCost,
        userSelectedModelId: input.userSelectedModelId,
        timeoutMs: PROVIDER_TIMEOUT_MS.frontend_implementation,
      },
      input.buildTrace,
    );
    if (!miniCall.ok) {
      /* keep scaffold/files */
    } else {
    accumulatedCost += miniCall.result.providerCostUsd;
    const miniPayload = parseFilePayload(miniCall.result.text);
    if (miniPayload.files.length) {
      allFiles = mergeIncomingBuildFiles(
        allFiles,
        miniPayload.files,
        events,
        track,
        effectiveMaxFiles,
      );
    }
    }
  }

  allFiles = filterRenderableBuildFiles(allFiles);

  if (input.shouldStopForCredits?.() && allFiles.length > 0) {
    track(
      events,
      "saving",
      "Saving progress",
      `partial_credit_stop:${allFiles.length}_files`,
    );
    return {
      ok: false,
      partialCreditStop: true,
      visibleText:
        "I used your remaining Build Credits and saved the progress. Add credits to continue the remaining steps.",
      meta: null,
      iconSvg: iconSvg || null,
      iconUrl: identityResult.iconUrl,
      appName,
      files: allFiles,
      events,
      totalProviderCostUsd: accumulatedCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      primaryModelId,
      complexity,
      uiQualityScore: 0,
      buildContract: {
        passed: false,
        allowed: true,
        failures: ["partial_credit_stop"],
        renderableCount: allFiles.length,
        pageCount: countRenderablePages(allFiles),
        uiQualityScore: 0,
        previewReady: false,
        userMessage:
          "I used your remaining Build Credits and saved the progress. Add credits to continue the remaining steps.",
      },
      errorMessage: "partial_credit_stop",
      appArchetype: archetype.id,
      postBuildFailures: ["partial_credit_stop"],
    };
  }

  const blueprintRoutes = planParsed?.pages?.map((p) => String(p)) ?? archetype.coreRoutes;
  const routeNorm = normalizeAppRouterBuildFiles(allFiles, {
    blueprintRoutes,
    appName,
  });
  allFiles = routeNorm.files;
  if (routeNorm.moved.length && process.env.NODE_ENV !== "production") {
    console.info("[build] app_router_normalized", routeNorm.moved.slice(0, 12));
  }

  let scaffoldFallback = applyArchetypeScaffoldFallback(archetype.id, allFiles, appName);
  if (countThinFiles(filterRenderableBuildFiles(allFiles)) > 3) {
    scaffoldFallback = applyArchetypeScaffoldFallback(archetype.id, allFiles, appName);
  }
  if (scaffoldFallback.usedFallback) {
    track(events, "validating", "Strengthening the app structure…");
    track(events, "writing", "Adding the required app structure");
    allFiles = scaffoldFallback.files;
    if (process.env.NODE_ENV !== "production") {
      console.info("[build] scaffold_fallback_used", {
        archetype: archetype.id,
        reason: scaffoldFallback.reason,
        before: scaffoldFallback.beforeCount,
        after: scaffoldFallback.afterCount,
      });
    }
  }

  const postScaffoldNorm = normalizeAppRouterBuildFiles(allFiles, {
    blueprintRoutes,
    appName,
  });
  allFiles = postScaffoldNorm.files;

  const allowBackend =
    (firstPassScope?.includeBackend ?? complexity >= 7) &&
    hasRouteFiles(allFiles) &&
    accumulatedCost < FULL_BUILD_CAP_USD * 0.9;

  if (allowBackend) {
    track(events, "writing", "Generating backend files");
    try {
      const beCall = await callProviderWithBuildTimeout(
        {
          writer: input.writer,
          userId: input.userId,
          userEmail: input.userEmail,
          operationId: `${input.operationId}:backend`,
          operationType: "backend_implementation",
          system: BUILD_SYSTEM,
          prompt: backendPrompt(planJson, schemaJson, contextSlices),
          complexity,
          accumulatedCostUsd: accumulatedCost,
          userSelectedModelId: input.userSelectedModelId,
          timeoutMs: PROVIDER_TIMEOUT_MS.backend_implementation,
        },
        input.buildTrace,
      );
      if (beCall.ok) {
      accumulatedCost += beCall.result.providerCostUsd;
      const bePayload = parseFilePayload(beCall.result.text);
      if (bePayload.files.length) {
        allFiles = mergeIncomingBuildFiles(
          allFiles,
          bePayload.files,
          events,
          track,
          effectiveMaxFiles,
        );
      }
      }
    } catch {
      /* backend optional */
    }
  }

  trackAssistant(
    events,
    `Checking imports, routes, and preview readiness across ${allFiles.length} file${allFiles.length === 1 ? "" : "s"}.`,
    emit,
  );
  track(events, "validating", `Validating ${allFiles.length} files`);
  let quality = assessBuildQuality(allFiles);
  let repairAttempts = 0;

  let uiQuality = checkGeneratedUiQuality({
    files: allFiles,
    appType: archetypeToLegacyAppType(archetype.id),
    routeMap: designBrief.routes,
  });

  while (
    (!quality.ok || !uiQuality.passesPreview) &&
    repairAttempts < 3 &&
    accumulatedCost < FULL_BUILD_CAP_USD
  ) {
    track(events, "repairing", userFacingRepairPassLabel(repairAttempts));
    const repairPrompt = uiQuality.basicUiFailure || uiQuality.score < previewReadyMinScore()
      ? buildPremiumUiRepairPrompt({
          designBrief,
          quality: uiQuality,
          files: allFiles,
          userPrompt: executionPrompt,
        })
      : buildRepairPrompt(quality.reasons, allFiles, executionPrompt);
    const repairCall = await callProviderWithBuildTimeout(
      {
        writer: input.writer,
        userId: input.userId,
        userEmail: input.userEmail,
        operationId: `${input.operationId}:ui-repair:${repairAttempts}`,
        operationType: repairAttempts === 0 ? "code_repair_small" : "code_repair_hard",
        system: BUILD_SYSTEM,
        prompt: repairPrompt,
        complexity,
        accumulatedCostUsd: accumulatedCost,
        userSelectedModelId: input.userSelectedModelId,
        timeoutMs:
          repairAttempts === 0
            ? PROVIDER_TIMEOUT_MS.code_repair_small
            : PROVIDER_TIMEOUT_MS.code_repair_hard,
      },
      input.buildTrace,
    );
    if (!repairCall.ok) break;
    accumulatedCost += repairCall.result.providerCostUsd;
    const repaired = parseFilePayload(repairCall.result.text);
    if (repaired.files.length) {
      allFiles = filterRenderableBuildFiles(
        mergeIncomingBuildFiles(allFiles, repaired.files, events, track, effectiveMaxFiles),
      );
    }
    quality = assessBuildQuality(allFiles);
    uiQuality = checkGeneratedUiQuality({
      files: allFiles,
      appType: archetypeToLegacyAppType(archetype.id),
      routeMap: designBrief.routes,
    });
    repairAttempts += 1;
  }

  track(events, "validating", "Checking the interface…");

  scaffoldFallback = applyArchetypeScaffoldFallback(archetype.id, allFiles, appName);
  if (scaffoldFallback.usedFallback) {
    track(events, "writing", "Adding the required pages…", `${scaffoldFallback.afterCount} files`);
    allFiles = scaffoldFallback.files;
  }

  const fileQuality = validateGeneratedBuild(allFiles);

  const { data: projAfterIdentity } = await input.writer
    .from("projects")
    .select("app_name, icon_url, icon_svg")
    .eq("id", input.projectId)
    .maybeSingle();

  const resolvedAppName = projAfterIdentity?.app_name?.trim() || appName;
  const hasIcon = Boolean(
    identityResult.iconUrl ||
      projAfterIdentity?.icon_url ||
      (iconSvg && iconSvg.startsWith("<svg")) ||
      projAfterIdentity?.icon_svg ||
      scaffoldFallback.usedFallback,
  );

  const requiredSlugs = requiredPageSlugsForArchetype(archetype.id);
  const tier: "small" | "standard" | "advanced" =
    complexity <= 2 ? "small" : complexity >= 7 ? "advanced" : "standard";

  if (
    knownArchetypeFastPath &&
    archetype.id === "restaurant_inventory" &&
    filterRenderableBuildFiles(allFiles).length < RESTAURANT_MIN_SCAFFOLD_FILES
  ) {
    return {
      ok: false,
      visibleText: "We could not assemble the restaurant app structure. Please retry.",
      meta: null,
      iconSvg: iconSvg || null,
      iconUrl: identityResult.iconUrl,
      appName,
      files: [],
      events,
      totalProviderCostUsd: accumulatedCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      primaryModelId,
      complexity,
      uiQualityScore: 0,
      buildContract: {
        passed: false,
        allowed: false,
        failures: ["restaurant_scaffold_not_applied"],
        renderableCount: filterRenderableBuildFiles(allFiles).length,
        pageCount: 0,
        uiQualityScore: 0,
        previewReady: false,
        userMessage: "Build needs repair — credits were returned.",
      },
      errorMessage: "restaurant_scaffold_not_applied",
      appArchetype: archetype.id,
      postBuildFailures: ["restaurant_scaffold_not_applied"],
    };
  }

  if (input.buildTrace) traceBuildWorkerStage(input.buildTrace, "contract_started");
  const enforced = enforcePostBuildContractWithRepair(
    {
      files: allFiles,
      appName: resolvedAppName,
      hasIcon,
      routeMap: designBrief.routes ?? planParsed?.pages?.map(String) ?? null,
      requiredPageSlugs: requiredSlugs,
      tier,
      projectId: input.projectId,
      ownerId: input.userId,
      appType: archetypeToLegacyAppType(archetype.id),
      scaffoldFallbackUsed: scaffoldFallback.usedFallback,
      archetypeId: archetype.id,
    },
    2,
  );

  if (!enforced.contract.passed && hasFullScaffoldTree(archetype.id)) {
    scaffoldFallback = applyArchetypeScaffoldFallback(archetype.id, enforced.files, resolvedAppName);
    if (scaffoldFallback.usedFallback) {
      track(events, "repairing", "Strengthening the app structure…");
      const retry = enforcePostBuildContractWithRepair(
        {
          files: scaffoldFallback.files,
          appName: resolvedAppName,
          hasIcon: true,
          routeMap: designBrief.routes ?? planParsed?.pages?.map(String) ?? null,
          requiredPageSlugs: requiredSlugs,
          tier,
          projectId: input.projectId,
          ownerId: input.userId,
          appType: archetypeToLegacyAppType(archetype.id),
          scaffoldFallbackUsed: true,
          archetypeId: archetype.id,
        },
        1,
      );
      if (retry.contract.passed) {
        allFiles = retry.files;
        Object.assign(enforced, retry);
        scaffoldFallback = { ...scaffoldFallback, usedFallback: true };
      }
    }
  }

  allFiles = enforced.files;
  if (input.buildTrace) {
    traceBuildWorkerStage(input.buildTrace, "contract_completed", enforced.contract.passed ? "passed" : "needs_repair");
  }
  const postContract = enforced.contract;
  const buildContract: BuildSuccessContractResult = postContract.buildContract;
  uiQuality = postContract.uiQuality;

  const ok = postContract.passed;
  const summaryText = postContract.userMessage;

  const modelRuntime = resolveModelRuntime(primaryModelId);

  const meta: BuilderOutputContract = {
    app: {
      name: appName,
      slug: appSlug,
      description: identityResult.shortDescription || planParsed?.summary || "",
      category,
      theme: undefined,
    },
    build_plan: (planParsed?.steps ?? []).slice(0, 6).map((title, i) => ({
      id: `step-${i}`,
      title: String(title),
      summary: "",
    })),
    plan: planParsed?.steps ?? [],
    pages: (planParsed?.pages ?? []).map((p) => ({ id: slugifyAppName(String(p)), title: String(p) })),
    entities: [],
    files: allFiles.map((f) => ({ path: f.path, action: "created" as const })),
    summary: ok
      ? `Built ${resolvedAppName} with ${allFiles.length} files. Your first version is ready.`
      : summaryText,
    dashboard: undefined,
    publish: undefined,
    preview: undefined,
    steps: [],
  };

  let resultMarkdown = "";
  if (intakeResult && ok) {
    const backlog = await loadBuildBacklog(input.writer, input.projectId);
    const resultSummary = formatBuildResultSummary({
      appName,
      scope: intakeResult.firstPassScope,
      intake: intakeResult.summary,
      backlog,
      builtScreens: planParsed?.pages?.map(String),
    });
    resultMarkdown = renderBuildResultMarkdown(resultSummary);
    meta.summary = resultSummary.headline;
  } else if (scope.coreV1Only && scope.backlog.length) {
    meta.summary = `${meta.summary} Remaining items are queued as next steps.`;
  }

  const summary = meta.summary ?? "";
  if (ok) track(events, "done", summary);
  else track(events, "failed", summaryText || "Build needs another pass before preview.");

  if (input.buildJobId) {
    const pipelineMeta = {
      pipeline: "staged",
      complexity,
      provider_cost_usd: accumulatedCost,
      workflow_events: events as unknown as Json,
      ui_quality_score: uiQuality.score,
      ui_preview_ready: buildContract.previewReady,
      build_success_contract: buildContract.passed,
      build_contract_failures: buildContract.failures,
      post_build_repair_passes: enforced.repairPasses,
      app_archetype: archetype.id,
      scaffold_fallback_used: scaffoldFallback.usedFallback,
      scaffold_fallback_reason: scaffoldFallback.reason,
      files_before_scaffold_fallback: scaffoldFallback.beforeCount,
      files_after_scaffold_fallback: scaffoldFallback.afterCount,
      user_selected_model_label: modelRuntime.userSelectedModelLabel,
      actual_provider: modelRuntime.actualProvider,
      actual_model_id: modelRuntime.actualModelId,
    } as Json;
    const { error: metaErr } = await input.writer
      .from("build_jobs")
      .update({ meta: pipelineMeta } as never)
      .eq("id", input.buildJobId);
    if (metaErr?.message?.includes("meta")) {
      await input.writer
        .from("build_jobs")
        .update({ metadata: pipelineMeta } as never)
        .eq("id", input.buildJobId);
    }
  }

  await logServerOperation({
    writer: input.writer,
    userId: input.userId,
    userEmail: input.userEmail,
    stage: "build",
    event: ok ? "build_pipeline_success" : "build_pipeline_failed",
    status: ok ? "ok" : "error",
    mode: "build",
    modelId: primaryModelId,
    projectId: input.projectId,
    buildJobId: input.buildJobId,
    operationId: input.operationId,
    errorMessage: ok
      ? null
      : buildContract.failures.join("; ") || summaryText || "build_contract_failed",
    metadata: {
      files: allFiles.length,
      renderable: buildContract.renderableCount,
      contract_passed: buildContract.passed,
      provider_cost_usd: accumulatedCost,
      output_tokens: totalOut,
      user_selected_model_label: modelRuntime.userSelectedModelLabel,
      actual_provider: modelRuntime.actualProvider,
      actual_model_id: modelRuntime.actualModelId,
      post_build_repair_passes: enforced.repairPasses,
    },
  });

  return {
    ok,
    visibleText: resultMarkdown
      ? `${buildVisibleNarrative(meta, events, summary, allFiles)}\n\n${resultMarkdown}`
      : buildVisibleNarrative(meta, events, summary, allFiles),
    meta,
    iconSvg: iconSvg || null,
    iconUrl: identityResult.iconUrl,
    appName: resolvedAppName,
    files: allFiles,
    events,
    totalProviderCostUsd: accumulatedCost,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    primaryModelId,
    complexity,
    uiQualityScore: uiQuality.score,
    buildContract,
    postBuildFailures: postContract.failures,
    appArchetype: archetype.id,
    errorMessage: ok ? undefined : buildContract.failures.join("; ") || summaryText,
    scaffoldFallbackUsed: scaffoldFallback.usedFallback,
    scaffoldFallbackReason: scaffoldFallback.usedFallback ? scaffoldFallback.reason : undefined,
    filesBeforeScaffoldFallback: scaffoldFallback.beforeCount,
    filesAfterScaffoldFallback: scaffoldFallback.afterCount,
  };
}
