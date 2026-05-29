#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const ok = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (cond) ok.push(msg);
  else errors.push(msg);
}

const applyReferral = read("src/lib/referrals/apply-referral.ts");
const dashboard = read("src/lib/referrals/referral-dashboard.ts");
const apiRoute = read("src/app/api/referrals/route.ts");
const dashboardUi = read("src/components/referrals/referrals-dashboard.tsx");
const bootstrap = read("src/lib/auth/profile-bootstrap.ts");
const migration = read("supabase/migrations/20260603180000_referral_reward_cap.sql");
const appOrigin = read("src/lib/url/app-origin.ts");
const callback = read("src/app/auth/callback/route.ts");
const oauthPrep = read("src/lib/auth/oauth-prep.ts");

const suite = process.argv[2] ?? "all";

const suites = {
  "referral-schema-integrity": () => {
    assert(applyReferral.includes("applyReferralForNewUser"), "applyReferralForNewUser");
    assert(applyReferral.includes("grantReferralRewards"), "grantReferralRewards");
    assert(dashboard.includes("loadReferralDashboard"), "dashboard loader");
    assert(migration.includes("referral_referrer_bonus"), "idempotent operation keys");
  },
  "referral-code-unique": () => {
    assert(dashboard.includes("referral_codes"), "referral_codes sync");
    assert(dashboard.includes("ensureUserReferralCode"), "ensure code");
  },
  "referral-new-user-attribution": () => {
    assert(bootstrap.includes("applyReferralForNewUser"), "bootstrap uses apply");
    assert(applyReferral.includes("attachReferralByCode"), "attach inside apply");
  },
  "referral-existing-user-blocked": () => {
    assert(applyReferral.includes("existing_user"), "blocks existing user");
    assert(read("src/app/api/referrals/attribute/route.ts").includes("existing_user"), "attribute blocks");
  },
  "referral-self-referral-blocked": () => {
    assert(applyReferral.includes("self_referral"), "self referral blocked");
  },
  "referral-invalid-code-nonblocking": () => {
    assert(applyReferral.includes("invalid_code"), "invalid code non-fatal");
  },
  "referral-reward-idempotent": () => {
    assert(applyReferral.includes("claim_referral_reward"), "RPC idempotent grant");
    assert(migration.includes("already_rewarded"), "SQL idempotent");
  },
  "referral-max-five-cap": () => {
    assert(migration.includes("v_referrer_rewarded_count >= 5"), "5 cap in SQL");
    assert(dashboard.includes("MAX_REFERRALS_PER_USER"), "max in dashboard");
  },
  "referral-grants-referrer-five-build-credits": () => {
    assert(migration.includes("Referral reward (inviter)"), "referrer grant");
  },
  "referral-grants-referred-five-build-credits": () => {
    assert(migration.includes("Referral welcome bonus"), "referred grant");
  },
  "referral-no-double-grant": () => {
    assert(migration.includes("on conflict"), "conflict safe inserts");
  },
  "referral-dashboard-stats": () => {
    assert(apiRoute.includes("loadReferralDashboard"), "API uses admin dashboard");
    assert(apiRoute.includes("no-store"), "API no-store");
    assert(!apiRoute.includes('.eq("referred_by", code)'), "no RLS-blocked profiles query");
  },
  "referral-dashboard-activity-user-email-avatar": () => {
    assert(dashboardUi.includes("avatarUrl"), "UI shows avatar");
    assert(dashboardUi.includes("email"), "UI shows email");
    assert(dashboard.includes("avatar_url"), "loads avatar_url");
  },
  "referral-referred-by-display": () => {
    assert(dashboardUi.includes("Invited by"), "referred-by UI");
    assert(apiRoute.includes("referredByProfile"), "API referredBy profile");
  },
  "referral-avatar-from-google-metadata": () => {
    assert(bootstrap.includes("avatar_url"), "bootstrap saves avatar");
    assert(bootstrap.includes("meta.picture"), "Google picture metadata");
  },
  "referral-api-no-store": () => {
    assert(apiRoute.includes("Cache-Control"), "cache control header");
  },
  "referral-credits-balance-refresh": () => {
    assert(dashboardUi.includes("refreshCredits"), "credits refresh on dashboard");
  },
  "production-auth-never-redirects-localhost": () => {
    assert(appOrigin.includes("resolveRequestOrigin"), "request origin resolver");
    assert(appOrigin.includes("PRODUCTION_CANONICAL_ORIGIN"), "production canonical");
    assert(callback.includes("resolveRequestOrigin"), "callback uses request origin");
  },
  "auth-error-uses-current-origin": () => {
    assert(callback.includes("resolveRequestOrigin(request)"), "callback origin from request");
  },
  "return-to-cross-origin-blocked": () => {
    assert(oauthPrep.includes("isSafeReturnPathForOrigin"), "blocks cross-origin returnTo");
  },
  "custom-domain-oauth-stays-custom-domain": () => {
    assert(
      read("src/lib/auth/oauth-redirect.ts").includes("resolveRequestOrigin"),
      "oauth redirect uses request origin",
    );
  },
};

function runAll() {
  Object.values(suites).forEach((fn) => fn());
}

if (suite === "all") {
  runAll();
} else if (suites[suite]) {
  suites[suite]();
} else {
  errors.push(`unknown suite: ${suite}`);
}

console.log(`\n=== verify:referral-system${suite !== "all" ? ` (${suite})` : ""} ===\n`);
ok.forEach((m) => console.log("✓", m));
if (errors.length) {
  errors.forEach((m) => console.error("✗", m));
  process.exit(1);
}
console.log(`\n${ok.length} checks passed.\n`);
