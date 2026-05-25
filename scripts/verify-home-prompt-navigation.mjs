#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function must(rel, needle, label) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    errors.push(`missing ${rel}`);
    return;
  }
  if (!fs.readFileSync(full, "utf8").includes(needle)) errors.push(`${rel} missing ${label}`);
}

function mustNot(rel, needle, label) {
  const home = fs.readFileSync(path.join(root, rel), "utf8");
  if (home.includes(needle)) errors.push(`${rel} should not contain ${label}`);
}

console.log("\n=== verify:home-prompt-navigation ===\n");

must("src/app/api/projects/start-from-home/route.ts", "startProjectFromHome", "start-from-home API");
must("src/lib/projects/start-from-home.ts", "waitForProjectReadable", "project readable wait");
must("src/lib/navigation/builder-url.ts", "buildBuilderUrl", "canonical builder URL");
must("src/components/os-home/os-home.tsx", "/api/projects/start-from-home", "home uses atomic API");
must("src/components/os-home/os-home.tsx", "onChange(\"\")", "home clears composer instantly");
must("src/components/os-home/os-home.tsx", "home-creating-state", "home creating state");
mustNot("src/components/os-home/os-home.tsx", "router.push(`/create?${params", "home no longer pushes prompt to /create");
must("src/components/create/builder-project-gate.tsx", "builder-project-recovery", "builder recovery screen");
must("src/app/(workspace)/apps/[appId]/builder/page.tsx", "BuilderProjectGate", "builder uses gate not notFound");
mustNot("src/app/(workspace)/apps/[appId]/builder/page.tsx", "notFound()", "builder avoids raw notFound");
must("src/app/not-found.tsx", "DreamOS86", "styled global not-found");
must("src/lib/create/autostart-handoff.ts", "peekPendingAutostartHandoff", "peek handoff without URL prompt");
must("src/components/create/workspace/immersive-workspace.tsx", "peekPendingAutostartHandoff", "autostart without URL prompt");

if (errors.length) {
  errors.forEach((e) => console.error("✗", e));
  process.exit(1);
}
console.log("✓ home prompt navigation contract");
