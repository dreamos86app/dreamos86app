#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderPage = path.join(root, "src/app/(workspace)/apps/[appId]/builder/page.tsx");
const createPage = path.join(root, "src/app/(workspace)/create/page.tsx");

if (!fs.existsSync(builderPage)) {
  console.error("✗ missing builder page at (workspace)/apps/[appId]/builder");
  process.exit(1);
}
if (!fs.existsSync(createPage)) {
  console.error("✗ missing create page at (workspace)/create");
  process.exit(1);
}

console.log("\n=== verify:builder-route-valid ===\n");
console.log("✓ /apps/[appId]/builder route file exists");
console.log("✓ /create route file exists");
