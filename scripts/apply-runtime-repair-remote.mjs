#!/usr/bin/env node
/**
 * Applies scripts/dreamos-runtime-repair.sql to linked Supabase via Management API.
 * Requires SUPABASE_ACCESS_TOKEN in env (from `supabase login` or dashboard).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "wciioegiczwqlmlroley";
const token = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access Tokens)");
  process.exit(1);
}

const sqlFile =
  process.argv[2] ??
  path.join(root, "scripts", process.env.DREAMOS_SQL_FILE ?? "dreamos-runtime-repair.sql");
const sql = fs.readFileSync(sqlFile, "utf8");

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
console.log("✓ Runtime repair applied to", projectRef);
console.log(text.slice(0, 500));
