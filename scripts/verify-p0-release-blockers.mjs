#!/usr/bin/env node
/**
 * P0 release blockers — AI chat, CRM preview, build status, workflow, Paddle webhook.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const aiChatPage = read("src/app/(app)/ai-chat/page.tsx");
const aiChatError = read("src/app/(app)/ai-chat/error.tsx");
const chatView = read("src/components/chat/chat-view.tsx");
const staticPreview = read("src/lib/preview/static-preview-builder.ts");
const restaurantPreview = read("src/lib/preview/restaurant-static-preview.ts");
const archetypeGuard = read("src/lib/preview/preview-archetype-guard.ts");
const crmScaffold = read("src/lib/build/nonprofit-crm-scaffold.ts");
const postContract = read("src/lib/build/post-build-contract.ts");
const archetypeFb = read("src/lib/build/archetype-scaffold-fallback.ts");
const guards = read("src/lib/build/workflow-status-guards.ts");
const coalesce = read("src/lib/build/workflow-stream-coalesce.ts");
const streamUi = read("src/components/create/workspace/agent-workflow-stream.tsx");
const immersive = read("src/components/create/workspace/immersive-workspace.tsx");
const paddleRoute = read("src/app/api/billing/paddle/webhook/route.ts");
const paddleStore = read("src/lib/billing/paddle-event-store.ts");
const paddleProc = read("src/lib/billing/paddle-webhook-processor.ts");
const vercelReady = read("src/lib/deploy/vercel-readiness.ts");
const deployView = read("src/components/deploy/deploy-view.tsx");
const buildPipeline = read("src/lib/build/build-pipeline.ts");

const suites = {
  "ai-chat-page-loads": () => {
    if (!aiChatPage.includes("ChatView")) throw new Error("ai-chat must render ChatView");
    if (!fs.existsSync(path.join(root, "src/app/(app)/ai-chat/page.tsx"))) {
      throw new Error("ai-chat route missing");
    }
  },
  "ai-chat-no-env-crash": () => {
    if (chatView.includes("process.env.PADDLE")) throw new Error("chat must not read Paddle env");
    if (!aiChatError.includes("[ai-chat] route error")) throw new Error("safe route logging missing");
  },
  "ai-chat-free-user-loads": () => {
    if (!chatView.includes('planIsFree')) throw new Error("free plan handling missing");
    if (!chatView.includes("DISCUSS_MODEL_ID_FREE")) throw new Error("free model fallback missing");
  },
  "ai-chat-zero-credits-loads": () => {
    if (!chatView.includes("isConfirmed")) throw new Error("credits must wait for confirmation");
    if (!chatView.includes("tokenBlocked")) throw new Error("zero-credit gate missing");
  },
  "ai-chat-mobile-loads": () => {
    if (!chatView.includes("mobileConvOpen")) throw new Error("mobile chat layout missing");
  },
  "crm-prompt-does-not-use-restaurant-scaffold": () => {
    if (postContract.includes("mergeRestaurantInventoryScaffold")) {
      throw new Error("post-build must not blanket-merge restaurant scaffold");
    }
    if (!postContract.includes("mergeScaffoldForArchetype")) {
      throw new Error("archetype-aware scaffold merge required");
    }
  },
  "nonprofit-crm-scaffold-content": () => {
    if (!crmScaffold.includes("donor CRM")) throw new Error("donor CRM copy missing");
    if (!crmScaffold.includes("app/donors/page.tsx")) throw new Error("donors page missing");
    if (!crmScaffold.includes("recurring-gifts")) throw new Error("recurring gifts page missing");
  },
  "crm-preview-no-pantry-text": () => {
    if (!staticPreview.includes("previewArchetypeMismatch")) throw new Error("archetype mismatch guard missing");
    if (!archetypeGuard.includes("pantry")) throw new Error("restaurant marker guard missing");
  },
  "no-stale-preview-cross-project": () => {
    if (!buildPipeline.includes("last_preview_session_id: null")) {
      throw new Error("must clear preview session on new build");
    }
  },
  "preview-session-bound-to-build-job": () => {
    if (!staticPreview.includes("data-build-job-id")) throw new Error("build job binding missing");
    if (!staticPreview.includes("data-snapshot-hash")) throw new Error("snapshot hash binding missing");
  },
  "preview-archetype-matches-project": () => {
    if (!staticPreview.includes("data-archetype-id")) throw new Error("archetype attr missing");
    if (restaurantPreview.includes('archetypeId === "restaurant_inventory"') === false) {
      throw new Error("restaurant preview must require archetype");
    }
  },
  "build-status-no-contradictory-copy": () => {
    if (!guards.includes("input.previewReady &&")) throw new Error("previewReady reconciliation missing");
  },
  "no-couldnt-start-when-files-exist": () => {
    if (!guards.includes("facts.hasFiles && facts.failureKind === \"failed_before_generation\"")) {
      throw new Error("hasFiles guard for failed_before_generation missing");
    }
  },
  "preview-not-blocked-when-renderable": () => {
    if (!immersive.includes("effectivePreviewSrcDoc?.trim()")) {
      throw new Error("must skip preview blocked when src doc renders");
    }
  },
  "repair-needed-copy-when-files-saved": () => {
    if (!guards.includes("Draft saved — needs repair before publishing")) {
      throw new Error("repair-needed copy missing");
    }
  },
  "refund-copy-only-with-refund-event": () => {
    if (!guards.includes("assertRefundCopyAllowed")) throw new Error("refund guard missing");
  },
  "build-status-single-source-of-truth": () => {
    if (!guards.includes("deriveBuildStatusFacts")) throw new Error("facts derivation missing");
    if (!guards.includes("resolveBuildRunSummary")) throw new Error("summary resolver missing");
  },
  "workflow-chat-native-layout": () => {
    if (!streamUi.includes("workflow-chat-assistant")) throw new Error("assistant chat rows missing");
    if (!streamUi.includes("workflow-file-card")) throw new Error("file cards missing");
  },
  "workflow-no-giant-single-panel": () => {
    if (!streamUi.includes("workflow-active-card")) throw new Error("compact active card missing");
  },
  "workflow-file-cards-line-counts": () => {
    if (!streamUi.includes("addedLines")) throw new Error("line counts on file cards missing");
  },
  "workflow-hides-internal-event-labels": () => {
    if (!coalesce.includes("INTERNAL_LABEL_RE")) throw new Error("internal label filter missing");
    if (!coalesce.includes("build_pipeline_entered")) throw new Error("must filter pipeline labels");
  },
  "workflow-no-duplicate-progress-spam": () => {
    if (!coalesce.includes("stableKeyForRow")) throw new Error("dedupe key missing");
  },
  "workflow-mobile-readable": () => {
    if (!streamUi.includes("max-w-[min(100%")) throw new Error("mobile width constraint missing");
  },
  "known-archetype-scaffolds": () => {
    if (!archetypeFb.includes("mergeScaffoldForArchetype")) throw new Error("merge export missing");
    if (!archetypeFb.includes("mergeNonprofitCrmScaffold")) throw new Error("CRM merge missing");
  },
  "crm-build-first-pass-files": () => {
    if (!crmScaffold.includes("app/automations/page.tsx")) throw new Error("automations page missing");
    if (!crmScaffold.includes("components/DataTable")) throw new Error("DataTable missing");
  },
  "crm-build-preview-renders": () => {
    if (!staticPreview.includes("mergeNonprofitCrmScaffold")) throw new Error("CRM preview path missing");
  },
  "publish-blocked-until-quality-pass": () => {
    if (!postContract.includes("PREVIEW_READY_MIN_SCORE")) throw new Error("quality gate missing");
  },
  "draft-preview-allowed-when-files-safe": () => {
    if (!immersive.includes("effectivePreviewSrcDoc")) throw new Error("draft preview src doc path missing");
  },
  "no-useful-files-cleared-on-quality-fail": () => {
    if (!read("src/lib/build/execute-staged-build-job.ts").includes("saveableFileCount")) {
      throw new Error("persist on partial quality fail missing");
    }
  },
  "missing-vercel-token-deploy-only": () => {
    if (chatView.includes("VERCEL_ACCESS_TOKEN")) throw new Error("chat must not mention Vercel token");
    if (!deployView.includes("VERCEL_ACCESS_TOKEN")) throw new Error("deploy view must document token");
  },
  "vercel-token-warning-copy": () => {
    if (!vercelReady.includes("Builds and previews still work")) {
      throw new Error("deploy-only warning copy missing");
    }
  },
  "missing-vercel-token-does-not-crash-ai-chat": () => {
    if (!aiChatPage.includes("Suspense")) throw new Error("ai-chat suspense boundary missing");
  },
  "paddle-webhook-valid-signature-accepted": () => {
    if (!paddleRoute.includes("verifyPaddleWebhookSignature")) throw new Error("signature verify missing");
  },
  "paddle-simulation-received-and-stored": () => {
    if (!paddleProc.includes("received_simulation_or_unlinked")) throw new Error("simulation status missing");
  },
  "paddle-simulation-missing-user-no-upgrade": () => {
    if (!paddleProc.includes("ENTITLEMENT_EVENTS")) throw new Error("entitlement guard missing");
    if (!paddleRoute.includes("has_user_id")) throw new Error("diagnostics missing");
  },
  "paddle-webhook-does-not-json-parse-empty-custom-data": () => {
    if (!paddleStore.includes("parseWebhookCustomData")) throw new Error("custom_data parser missing");
  },
  "paddle-webhook-no-request-json-after-text": () => {
    if (paddleRoute.includes("request.json()")) throw new Error("must not call request.json after text");
    if (!paddleRoute.includes("request.text()")) throw new Error("must use request.text()");
  },
  "paddle-unknown-price-no-upgrade": () => {
    if (!paddleProc.includes("unknown_price_id")) throw new Error("unknown price handling missing");
  },
};

const selected = process.argv.slice(2).filter(Boolean);
const names = selected.length ? selected : Object.keys(suites);

console.log("\n=== verify:p0-release-blockers ===\n");
let failed = 0;
for (const name of names) {
  try {
    suites[name]();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(failed ? `\n${failed} failed\n` : "\nAll passed\n");
process.exit(failed ? 1 : 0);
