#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = ["verify:home-prompt-navigation", "verify:builder-route-valid"];

console.log("\n=== verify:no-raw-404-after-home-submit ===\n");
for (const script of checks) {
  const r = spawnSync("npm", ["run", script], { cwd: root, shell: true, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log("✓ no raw 404 guards present");
