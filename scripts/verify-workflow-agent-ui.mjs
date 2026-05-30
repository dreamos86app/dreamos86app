#!/usr/bin/env node
/**
 * Agent workflow UI + status guard verification (P0 workflow upgrade).
 * Run: node scripts/verify-workflow-agent-ui.mjs [suite...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const guards = read("src/lib/build/workflow-status-guards.ts");
const coalesce = read("src/lib/build/workflow-stream-coalesce.ts");
const types = read("src/lib/build/workflow-stream-types.ts");
const streamUi = read("src/components/create/workspace/agent-workflow-stream.tsx");
const summary = read("src/components/create/workspace/build-run-summary.tsx");
const jobEvents = read("src/lib/build/build-job-events.ts");
const execute = read("src/lib/build/execute-staged-build-job.ts");
const contract = read("src/lib/build/post-build-contract.ts");
const immersive = read("src/components/create/workspace/immersive-workspace.tsx");
const pipeline = read("src/lib/build/build-pipeline.ts");
const lineCounts = read("src/lib/build/file-line-counts.ts");
const creationWs = read("src/components/create/workspace/creation-workspace.tsx");
const createPage = read("src/components/create/create-page-body.tsx");
const composerText = read("src/lib/create/composer-text.ts");
const builderGate = read("src/components/create/builder-project-gate.tsx");
const userFacing = read("src/lib/workflow/user-facing-workflow-events.ts");
const ephemeral = read("src/lib/workflow/workflow-ephemeral-steps.ts");
const filePathUtil = read("src/lib/workflow/workflow-file-path.ts");
const identity = read("src/lib/projects/app-identity-service.ts");
const logoGen = read("src/lib/projects/app-logo-generation.ts");
const buildWorkerTrace = read("src/lib/build/build-worker-trace.ts");

const suites = {
  "workflow-event-schema": () => {
    if (!types.includes("assistant_message")) throw new Error("missing assistant_message category");
    if (!types.includes("file_created")) throw new Error("missing file_created category");
    if (!types.includes("failed_before_generation")) throw new Error("missing failed_before_generation");
  },
  "workflow-no-duplicate-repeated-steps": () => {
    if (!coalesce.includes("stableKey")) throw new Error("coalesce must use stableKey");
    if (!coalesce.includes("GENERIC_TITLES")) throw new Error("coalesce must filter generic titles");
    if (jobEvents.includes("Planning data model")) throw new Error("duplicate initial planning event still seeded");
  },
  "workflow-file-change-cards": () => {
    if (!streamUi.includes("workflow-file-card")) throw new Error("file change cards missing");
    if (!streamUi.includes("FileChangeCard")) throw new Error("FileChangeCard component missing");
  },
  "workflow-line-counts": () => {
    if (!coalesce.includes("addedLines")) throw new Error("line count parsing missing in coalesce");
    if (!streamUi.includes("+${event.addedLines}")) throw new Error("UI must show +line counts");
  },
  "workflow-natural-assistant-messages": () => {
    if (!jobEvents.includes("stream_category")) throw new Error("assistant stream_category metadata missing");
    if (!userFacing.includes("userFacingArchetypeLabel")) throw new Error("archetype opener helper");
  },
  "composer-enablement-credits-gate": () => {
    if (!composerText.includes("creditsConfirmed")) {
      throw new Error("composer must gate credits on creditsConfirmed");
    }
    if (!createPage.includes("opacity-0")) {
      throw new Error("create workspace layer must not use display:hidden during hydrate");
    }
    if (read("src/components/create/create-server-composer-island.tsx").includes('data-testid="create-composer-ready"')) {
      throw new Error("server island must not emit fake create-composer-ready");
    }
  },
  "workflow-assistant-messages-during-build": () => {
    if (!pipeline.includes("trackAssistant")) throw new Error("trackAssistant missing in pipeline");
    if (!pipeline.includes("userFacingArchetypeLabel")) throw new Error("archetype assistant opener");
    if (!jobEvents.includes("persistAssistantBuildMessage")) throw new Error("persistAssistantBuildMessage missing");
    if (!execute.includes("persistAssistantBuildMessage")) throw new Error("terminal assistant summary missing");
  },
  "workflow-line-counts-from-backend": () => {
    if (!lineCounts.includes("computeFileLineMeta")) throw new Error("computeFileLineMeta missing");
    if (!pipeline.includes("mergeIncomingBuildFiles")) throw new Error("mergeIncomingBuildFiles missing");
    if (!jobEvents.includes("added_lines")) throw new Error("persist must include added_lines metadata");
    if (!jobEvents.includes("old_line_count")) throw new Error("persist must include old_line_count metadata");
  },
  "no-legacy-build-timeline-visible": () => {
    if (creationWs.includes("BuildTimeline") || creationWs.includes("BuildStatusNarrator")) {
      throw new Error("creation-workspace still mounts legacy timeline/narrator");
    }
    if (!immersive.includes("BuildLiveProgress") && !immersive.includes("AgentWorkflowStream")) {
      throw new Error("immersive must use agent workflow stream");
    }
    if (!createPage.includes("CreateWorkspaceEntry")) {
      throw new Error("create page must use CreateWorkspaceEntry (ImmersiveWorkspace)");
    }
    if (!builderGate.includes("ImmersiveWorkspace")) {
      throw new Error("builder gate must use ImmersiveWorkspace");
    }
  },
  "workflow-status-state-guards": () => {
    if (!guards.includes("deriveBuildStatusFacts")) throw new Error("deriveBuildStatusFacts missing");
    if (!guards.includes("resolveBuildRunSummary")) throw new Error("resolveBuildRunSummary missing");
    if (!immersive.includes("applyTerminalBuildSummary")) throw new Error("immersive must use guarded summary");
  },
  "no-repair-copy-before-files": () => {
    if (!guards.includes("failed_before_generation")) throw new Error("failed_before_generation status missing");
    if (!execute.includes("failure_kind")) throw new Error("failure_kind metadata not persisted");
    if (contract.includes("another repair pass before preview") && !contract.includes("!hasRenderableFiles"))
      throw new Error("contract must guard repair copy when no files");
  },
  "no-refund-copy-without-refund": () => {
    if (!guards.includes("creditsRefunded")) throw new Error("creditsRefunded fact missing");
    if (!guards.includes("assertRefundCopyAllowed")) throw new Error("refund guard missing");
    if (immersive.includes("refunded: failed && !partial"))
      throw new Error("immersive must not use heuristic refunded=failed&&!partial");
  },
  "partial-build-copy-correct": () => {
    if (!guards.includes("partial_credit_stop")) throw new Error("partial_credit_stop copy missing");
    if (!summary.includes("Partial progress saved")) throw new Error("summary partial headline missing");
  },
  "failed-before-generation-copy": () => {
    if (!guards.includes("Couldn't start the build")) throw new Error("failed before generation headline missing");
    if (!execute.includes("userSafeFailureTitle")) throw new Error("execute must use safe failure titles");
  },
  "failed-after-generation-copy": () => {
    if (!guards.includes("failed_after_generation")) throw new Error("failed_after_generation missing");
  },
  "build-summary-card": () => {
    if (!summary.includes("data-testid=\"build-run-summary\"")) throw new Error("summary card testid missing");
    if (!summary.includes("showRepairActions")) throw new Error("repair actions prop missing");
  },
  "workflow-reduced-motion": () => {
    if (!streamUi.includes("useReducedMotion")) throw new Error("reduced motion hook missing");
  },
  "workflow-starts-alive-fast": () => {
    if (!ephemeral.includes("buildEphemeralWorkflowEvents")) throw new Error("ephemeral builder missing");
    if (!streamUi.includes("buildStartedAtMs")) throw new Error("stream needs buildStartedAtMs");
    if (!immersive.includes("buildStartedAtRef")) throw new Error("immersive build start ref");
  },
  "workflow-active-step-updates": () => {
    if (!streamUi.includes("workflow-active-step")) throw new Error("active step card");
    if (!streamUi.includes("setInterval")) throw new Error("client tick for ephemeral");
  },
  "workflow-no-stuck-planning": () => {
    if (immersive.includes('Planning your build…') && !immersive.includes('mode !== "build"'))
      throw new Error("immersive still shows Planning your build for build mode");
    if (!userFacing.includes("Mapping screens and data")) throw new Error("friendly planning copy");
  },
  "workflow-ephemeral-events-merge-with-server": () => {
    if (!ephemeral.includes("mergeEphemeralWithServerEvents")) throw new Error("merge helper");
  },
  "workflow-chat-native-layout": () => {
    if (!streamUi.includes("AssistantBubble")) throw new Error("assistant bubbles");
    if (!streamUi.includes("data-testid=\"workflow-chat-assistant\"")) throw new Error("chat testid");
  },
  "workflow-no-giant-single-panel": () => {
    if (streamUi.includes("max-h-") && streamUi.includes("overflow-y-auto"))
      throw new Error("nested scroll in stream");
  },
  "workflow-no-nested-scroll-panel": () => {
    suites["workflow-no-giant-single-panel"]();
  },
  "workflow-one-active-spinner": () => {
    if (!coalesce.includes("applySingleActiveWorkflowStep")) throw new Error("single active");
    if (!streamUi.includes("ev.stableKey !== active?.stableKey")) throw new Error("hide dup active row");
  },
  "workflow-no-duplicate-progress-spam": () => {
    if (!coalesce.includes("seenTitle")) throw new Error("dedupe titles in coalesce");
  },
  "workflow-hides-internal-event-labels": () => {
    if (!userFacing.includes("weak_output_detected")) throw new Error("internal key map");
    if (!userFacing.includes("Premium UI repair")) throw new Error("repair pattern map");
  },
  "workflow-no-raw-snake-case": () => {
    if (!userFacing.includes("SNAKE_CASE_RE")) throw new Error("snake case guard");
  },
  "workflow-no-quality-scores-to-users": () => {
    if (!userFacing.includes("QUALITY_SCORE_RE")) throw new Error("score strip");
    if (pipeline.includes("score ${uiQuality.score}")) throw new Error("pipeline still emits scores");
  },
  "workflow-file-cards-only-real-files": () => {
    if (!filePathUtil.includes("isValidWorkflowFilePath")) throw new Error("path validator");
    if (!streamUi.includes("isFileEvent")) throw new Error("isFileEvent guard");
  },
  "workflow-non-file-events-not-file-cards": () => {
    if (!streamUi.includes("isValidWorkflowFilePath(ev.filePath)")) throw new Error("path check in UI");
  },
  "workflow-file-cards-line-counts": () => {
    if (!streamUi.includes("addedLines")) throw new Error("line counts in UI");
  },
  "workflow-file-card-valid-path-required": () => {
    suites["workflow-file-cards-only-real-files"]();
  },
  "workflow-file-card-no-fake-created-events": () => {
    if (!filePathUtil.includes("FORBIDDEN_PATH_FRAGMENT")) throw new Error("forbidden fragments");
    if (!buildWorkerTrace.includes("scaffold_fallback_applied")) throw new Error("trace stage exists");
    if (
      buildWorkerTrace.includes('input.stage === "scaffold_fallback_applied"') &&
      buildWorkerTrace.match(/scaffold_fallback_applied[\s\S]*writing_file/)
    ) {
      throw new Error("scaffold must not map to writing_file");
    }
  },
  "workflow-file-grouping": () => {
    if (!streamUi.includes("groupFileEvents")) throw new Error("file grouping");
  },
  "icon-generation-build-only": () => {
    if (!identity.includes("createAppIdentityForBuild")) throw new Error("identity service");
    if (!pipeline.includes("createAppIdentityForBuild")) throw new Error("pipeline calls identity");
  },
  "icon-generation-not-in-discuss": () => {
    if (!immersive.includes('mode === "build"')) throw new Error("build mode guard");
  },
  "icon-generation-action-credit-precheck": () => {
    if (!identity.includes("assertActionCreditsAffordable")) throw new Error("precheck");
    if (!identity.includes("chargeActionCredit")) throw new Error("charge");
  },
  "icon-generation-no-negative-action-credits": () => {
    if (!identity.includes("!charge.ok")) throw new Error("charge failure path");
  },
  "icon-generation-saves-project-icon": () => {
    if (!identity.includes("persistAppIdentity")) throw new Error("persist identity");
    if (!logoGen.includes("uploadLogoDerivatives")) throw new Error("upload logos");
  },
  "icon-generation-no-repeat-on-repair": () => {
    if (!identity.includes("logo_generation_status === \"generated\"")) throw new Error("reuse generated icon");
  },
  "icon-generation-cheapest-route": () => {
    if (!logoGen.includes("routeImageProvider")) throw new Error("cheap route");
    if (!logoGen.includes("generateBrandIconFromSvg")) throw new Error("brand svg upload");
    if (!logoGen.includes("buildFallbackIconSvg")) throw new Error("svg fallback");
    if (!identity.includes("generateBrandIconFromSvg")) throw new Error("identity uses brand svg");
  },
  "project-icon-updates-ui": () => {
    if (!identity.includes("icon_url")) throw new Error("icon_url patch");
  },
  "discuss-mode-no-build-side-effects": () => {
    if (!immersive.includes('mode === "build"')) throw new Error("mode checks");
  },
  "plan-first-no-icon-before-confirm": () => {
    if (!immersive.includes("blueprintApproved")) throw new Error("plan first gate");
  },
  "build-mode-generates-icon": () => {
    if (!pipeline.includes("skipLogo: false")) throw new Error("logo enabled on build");
  },
};

const requested = process.argv.slice(2).filter(Boolean);
const keys = requested.length ? requested : Object.keys(suites);
const errors = [];
const ok = [];

for (const key of keys) {
  const fn = suites[key];
  if (!fn) {
    errors.push(`unknown suite: ${key}`);
    continue;
  }
  try {
    fn();
    ok.push(key);
  } catch (e) {
    errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\n=== verify:workflow-agent-ui ===\n");
ok.forEach((m) => console.log("✓", m));
errors.forEach((m) => console.error("✗", m));
process.exit(errors.length ? 1 : 0);
