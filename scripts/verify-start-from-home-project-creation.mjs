#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "src/lib/projects/start-from-home.ts"), "utf8");
const errors = [];

if (!src.includes("createProjectFromPrompt")) errors.push("uses createProjectFromPrompt");
if (!src.includes("ensureProjectConversation")) errors.push("ensures conversation");
if (!src.includes('from("messages")')) errors.push("inserts user message");
if (!src.includes('from("build_jobs")')) errors.push("optional build job");
if (!src.includes("waitForProjectReadable")) errors.push("waits for readable project");
if (!src.includes("buildBuilderUrl")) errors.push("returns builderUrl without prompt");

console.log("\n=== verify:start-from-home-project-creation ===\n");
if (errors.length) {
  errors.forEach((e) => console.error("✗", e));
  process.exit(1);
}
console.log("✓ start-from-home server contract");
