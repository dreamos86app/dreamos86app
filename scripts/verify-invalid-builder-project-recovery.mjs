#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = fs.readFileSync(path.join(root, "src/components/create/builder-project-gate.tsx"), "utf8");
const errors = [];

const needles = [
  ["couldn", "recovery headline"],
  ["/projects", "back to apps link"],
  ["Start again", "start again button"],
  ["Retry", "retry button"],
  ["[builder-gate] project unavailable", "dev log"],
];
for (const [needle, label] of needles) {
  if (!gate.includes(needle)) errors.push(`builder-project-gate missing ${label}`);
}

console.log("\n=== verify:invalid-builder-project-recovery ===\n");
if (errors.length) {
  errors.forEach((e) => console.error("✗", e));
  process.exit(1);
}
console.log("✓ invalid builder recovery UI");
