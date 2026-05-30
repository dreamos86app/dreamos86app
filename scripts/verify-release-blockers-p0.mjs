#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const checks = [
  () => read("src/lib/build/app-router-route-normalizer.ts").includes("app/${slug}/page."),
  () => read("src/lib/build/persist-generated-files.ts").includes("normalizeAppRouterBuildFiles"),
  () => !read("src/components/create/workspace/immersive-workspace.tsx").includes("followUpQueue)"),
  () => read("src/components/create/workspace/immersive-workspace.tsx").includes("queue-${item.id}"),
  () => read("src/lib/ai/model-mix-router.ts").includes("cheap_helper_discuss"),
  () => read("src/lib/build/build-pipeline.ts").includes("primaryMix.mainModelId"),
  () => read("src/app/api/ai/usage/summary/route.ts").includes("ai_usage_logs"),
  () => read("src/components/billing/billing-downgrade-modal.tsx").includes("Cancel subscription"),
  () => read("src/components/billing/billing-subscription-panel.tsx").includes("View all plans"),
  () => read("src/lib/projects/app-logo-generation.ts").includes('quality: "low"'),
];

let failed = 0;
for (const [i, c] of checks.entries()) {
  try {
    if (!c()) {
      console.error("FAIL check", i + 1);
      failed++;
    } else {
      console.log("OK check", i + 1);
    }
  } catch (e) {
    console.error("FAIL check", i + 1, e.message);
    failed++;
  }
}

if (failed) process.exit(1);
console.log("\nAll release blocker checks passed.");
