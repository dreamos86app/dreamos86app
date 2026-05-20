/**
 * Browser verification for create/chat composer submit.
 * Requires: dev server on :3000, logged-in session in storage-state.json (optional).
 *
 * Run: node scripts/verify-composer-submit.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const storagePath = path.join(process.cwd(), ".playwright-auth.json");

async function runPage(page, label, url, btnSelector, typeText) {
  const logs = [];
  const posts = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[create") || t.includes("[chat")) logs.push(t);
  });
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/ai/preflight") || u.includes("/api/chat")) {
      posts.push(`${req.method()} ${new URL(u).pathname}`);
    }
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  const finalUrl = page.url();
  if (finalUrl.includes("/auth/login")) {
    return { label, ok: false, reason: "redirected to login — add .playwright-auth.json or sign in manually", logs, posts, finalUrl };
  }

  if (typeText) {
    const ta = page.locator("textarea").first();
    await ta.fill(typeText);
  }

  const btn = page.locator(btnSelector).first();
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  await btn.click();
  await page.waitForTimeout(4_000);

  const uiClick = logs.some((l) => l.includes("build click") || l.includes("send click"));
  const formSubmit = logs.some((l) => l.includes("form submit fired"));
  const handleStart = logs.some((l) => l.includes("handleSubmit start"));
  const preflight = posts.some((p) => p.includes("/api/ai/preflight"));
  const chat = posts.some((p) => p.includes("/api/chat"));

  return {
    label,
    ok: uiClick && formSubmit && handleStart && preflight,
    uiClick,
    formSubmit,
    handleStart,
    preflight,
    chat,
    logs: logs.slice(0, 20),
    posts,
    finalUrl,
  };
}

const browser = await chromium.launch({ headless: true });
const contextOpts = fs.existsSync(storagePath) ? { storageState: storagePath } : {};
const context = await browser.newContext(contextOpts);
const page = await context.newPage();

const results = [];
results.push(
  await runPage(
    page,
    "create",
    `${base}/create?prompt=TEST&mode=build`,
    "[data-create-build-btn]",
    null,
  ),
);
results.push(
  await runPage(
    page,
    "chat",
    `${base}/chat`,
    "[data-chat-send-btn]",
    "say hello",
  ),
);

await browser.close();

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
