#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "src/lib/projects/start-from-home.ts"), "utf8");
const home = fs.readFileSync(path.join(root, "src/components/os-home/os-home.tsx"), "utf8");
const errors = [];

if (!src.includes('intent: "question"')) errors.push("question branch in start-from-home");
if (!src.includes("discussUrl")) errors.push("discussUrl for questions");
if (!home.includes('data.intent === "question"')) errors.push("home routes questions to discuss");

console.log("\n=== verify:question-from-home-does-not-create-project ===\n");
if (errors.length) {
  errors.forEach((e) => console.error("✗", e));
  process.exit(1);
}
console.log("✓ questions skip project creation");
