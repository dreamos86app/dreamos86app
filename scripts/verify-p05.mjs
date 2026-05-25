#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkId = process.argv[2];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustInclude(rel, needle, label) {
  if (!read(rel).includes(needle)) throw new Error(`${rel} missing ${label}`);
}

function mustNotInclude(rel, needle, label) {
  if (read(rel).includes(needle)) throw new Error(`${rel} should not contain ${label}`);
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`missing ${rel}`);
}

const CHECKS = {
  "no-duplicate-projects-from-chat": () => {
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "project_reused", "reuse existing project log");
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "project_create_deferred_plan_first", "defer plan-first create");
    mustInclude("src/lib/projects/create-project-idempotency.ts", "findProjectByCreateIdempotency", "idempotency lookup");
  },
  "home-prompt-handoff": () => {
    mustInclude("src/components/os-home/os-home.tsx", "storeAutostartHandoff", "home stores handoff");
    mustInclude("src/components/os-home/os-home.tsx", "/api/projects/start-from-home", "home atomic start API");
    mustInclude("src/lib/create/autostart-handoff.ts", "handoff_consumed", "handoff consumed log");
    mustInclude("src/lib/create/autostart-handoff.ts", "peekPendingAutostartHandoff", "peek handoff for builder");
    mustInclude("src/components/create/create-workspace-entry.tsx", "assertProjectReady", "create verifies project before navigate");
  },
  "home-prompt-appears-in-builder-chat": () => {
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "pendingUserBubble", "optimistic user bubble");
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "setPendingUserBubble(handoff.text)", "autostart optimistic message");
  },
  "existing-project-reused": () => {
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", 'pushRuntimeDiagnostic("project_reused"', "project reused diagnostic");
    mustInclude("src/app/api/create/project-draft/route.ts", "reused: true", "draft reuse response");
  },
  "plan-first-no-project-for-questions": () => {
    mustInclude("src/components/create/create-workspace-entry.tsx", "initialSkipDraft", "skip draft for discuss");
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "project_create_deferred_plan_first", "plan-first defer");
  },
  "no-credit-chip-near-publish": () => {
    mustNotInclude("src/components/create/workspace/workspace-launcher.tsx", "CreditsBalanceChip", "credits chip in builder toolbar");
    mustInclude("src/components/create/workspace/workspace-launcher.tsx", 'variant="popover"', "credits only in workspace popover");
  },
  "builder-empty-state-hidden-after-submit": () => {
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "chatEngaged", "chat engaged gate");
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "!chatEngaged", "empty state requires no engagement");
  },
  "builder-submit-optimistic": () => {
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "setPendingUserBubble(text)", "submit optimistic bubble");
    mustInclude("src/components/create/workspace/immersive-workspace.tsx", "setChatEngaged(true)", "engage chat on submit");
  },
  "create-idempotency": () => {
    mustExist("src/lib/projects/create-project-idempotency.ts");
    mustInclude("src/app/api/projects/create-from-prompt/route.ts", "idempotencyKey", "create-from-prompt idempotency");
    mustInclude("src/app/api/create/project-draft/route.ts", "findProjectByCreateIdempotency", "draft idempotency lookup");
  },
};

if (!checkId || !CHECKS[checkId]) {
  console.error(`Usage: node scripts/verify-p05.mjs <${Object.keys(CHECKS).join("|")}>`);
  process.exit(1);
}

console.log(`\n=== verify:${checkId} ===\n`);
try {
  CHECKS[checkId]();
  console.log("✓", checkId);
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
}
