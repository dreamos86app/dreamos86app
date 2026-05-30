#!/usr/bin/env node
/**
 * Applies scripts/manual-sql/build-job-events.sql to linked Supabase via Management API.
 * Requires SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access Tokens).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "wciioegiczwqlmlroley";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN, then run: npm run db:apply-build-events");
  process.exit(1);
}

const sql = fs.readFileSync(path.join(root, "scripts", "manual-sql", "build-job-events.sql"), "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error("Apply failed:", res.status, text.slice(0, 2000));
  process.exit(1);
}

console.log("✓ build_job_events applied to", projectRef);
console.log(text.slice(0, 500));
