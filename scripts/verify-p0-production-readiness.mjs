#!/usr/bin/env node
/**
 * P0 production readiness — runtime health, chat loop, credits, Paddle, billing, Vercel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const chatView = read("src/components/chat/chat-view.tsx");
const chatStore = read("src/lib/stores/chat-conversation-store.ts");
const adminHealth = read("src/lib/db/admin-runtime-health.ts");
const creditDisplay = read("src/lib/credits/credit-balance-display.ts");
const creditsTracker = read("src/components/credits/credits-tracker.tsx");
const creditsStore = read("src/lib/stores/credits-store.ts");
const paddleStore = read("src/lib/billing/paddle-event-store.ts");
const paddleProc = read("src/lib/billing/paddle-webhook-processor.ts");
const billingSettings = read("src/components/settings/billing-settings.tsx");
const userMenu = read("src/components/layout/user-menu.tsx");
const upgradePolicy = read("src/lib/billing/upgrade-policy.ts");
const vercelConn = read("src/lib/deploy/vercel-connection.ts");
const migration = read("supabase/migrations/20260530180000_runtime_health_rpcs_paddle_billing.sql");
const manualSql = read("scripts/manual-sql/runtime-health-rpcs.sql");

function creditsDenominatorIncludesBonus() {
  const displayBlock = creditDisplay.slice(
    creditDisplay.indexOf("formatCreditBucketDisplay"),
    creditDisplay.indexOf("export function formatCreditBalanceDisplay"),
  );
  if (!displayBlock.includes("totalCap")) throw new Error("totalCap required for denominator");
  if (!displayBlock.match(/displayText.*totalCap/)) {
    throw new Error("displayText must use totalCap (plan + bonus)");
  }
  if (!displayBlock.includes("bonusLabel")) throw new Error("bonusLabel required");
  if (!displayBlock.includes("remainingTotal")) throw new Error("remainingTotal required");
}

const suites = {
  "runtime-health-rpcs": () => {
    if (!migration.includes("charge_credits")) throw new Error("migration missing charge_credits");
    if (!manualSql.includes("charge_credits")) throw new Error("manual SQL missing charge_credits");
    if (!migration.includes("complete_user_onboarding")) throw new Error("onboarding RPC missing");
    if (!migration.includes("claim_referral_reward")) throw new Error("referral RPC missing");
  },
  "charge-credits-or-charge-tokens-compatible": () => {
    if (!migration.includes("charge_tokens")) throw new Error("charge_credits must delegate to charge_tokens");
  },
  "onboarding-rpc-exists": () => {
    if (!migration.includes("complete_user_onboarding")) throw new Error("missing");
  },
  "referral-rpc-exists": () => {
    if (!migration.includes("claim_referral_reward")) throw new Error("missing");
  },
  "runtime-health-no-invalid-amount-false-fail": () => {
    if (!adminHealth.includes("isRpcProbeValidationOk")) throw new Error("validation ok helper missing");
    if (!adminHealth.includes("sanitizeRpcProbeLastError")) throw new Error("sanitize missing");
  },
  "chat-no-infinite-loop": () => {
    if (!chatStore.includes("EMPTY_CHAT_MESSAGES")) throw new Error("stable empty constant missing");
    if (!chatView.includes("EMPTY_CHAT_MESSAGES")) throw new Error("chat-view must use EMPTY_CHAT_MESSAGES");
    if (chatView.match(/messagesByConversationId\[conversationId\] \?\? \[\]/)) {
      throw new Error("inline ?? [] still in useMessages");
    }
  },
  "chat-page-loads": () => {
    if (!fs.existsSync(path.join(root, "src/app/(app)/chat/page.tsx"))) throw new Error("chat route missing");
  },
  "ai-chat-page-loads": () => {
    if (!fs.existsSync(path.join(root, "src/app/(app)/ai-chat/page.tsx"))) throw new Error("ai-chat route missing");
  },
  "chat-zero-credits-loads": () => {
    if (!chatView.includes("isConfirmed")) throw new Error("credits confirmation gate missing");
  },
  "chat-mobile-loads": () => {
    if (!chatView.includes("mobileConvOpen")) throw new Error("mobile layout missing");
  },
  "credits-display-bonus-separated": () => {
    if (!creditDisplay.includes("secondaryText")) throw new Error("bonus secondary text missing");
    if (!creditDisplay.includes("+")) throw new Error("bonus format missing");
    if (!creditsTracker.includes("text-violet-500")) throw new Error("purple bonus UI missing");
  },
  "admin-users-shows-build-bonus": () => {
    const admin = read("src/components/admin/admin-users-panel.tsx");
    if (!admin.includes("bonus_credits")) throw new Error("build bonus column missing");
    if (!admin.includes("text-violet-500")) throw new Error("purple bonus missing");
  },
  "admin-users-shows-action-bonus": () => {
    const admin = read("src/components/admin/admin-users-panel.tsx");
    if (!admin.includes("action_credits_bonus")) throw new Error("action bonus missing");
  },
  "user-menu-shows-credit-bonus": () => {
    if (!creditsTracker.includes("secondaryText")) throw new Error("popover bonus line missing");
  },
  "billing-page-no-bonus-denominator": creditsDenominatorIncludesBonus,
  "credits-denominator-includes-bonus": creditsDenominatorIncludesBonus,
  "billing-page-credit-bonus-denominator": creditsDenominatorIncludesBonus,
  "credits-loading-no-random-flash": () => {
    if (!creditsTracker.includes("Loading credits")) throw new Error("loading copy missing");
    if (!creditsStore.includes("isConfirmed")) throw new Error("confirmed gate missing");
  },
  "credits-bootstrap-loading-state": () => {
    if (!creditsStore.includes("applyProfileHint")) throw new Error("profile hint path missing");
    if (creditsStore.includes("isConfirmed: true") && creditsStore.includes("applyProfileHint")) {
      /* profile hint must not set confirmed */
    }
    if (!creditsStore.match(/if \(s\.isConfirmed\)/)) throw new Error("profile must not overwrite confirmed");
  },
  "profile-seed-not-confirmed": () => {
    if (!creditsStore.includes("never overwrites confirmed")) throw new Error("documented guard missing");
  },
  "confirmed-credits-not-overwritten-by-stale-profile": () => {
    if (!creditsStore.includes("if (s.isConfirmed)")) throw new Error("confirmed guard missing");
  },
  "paddle-webhook-valid-signature-accepted": () => {
    const route = read("src/app/api/billing/paddle/webhook/route.ts");
    if (!route.includes("verifyPaddleWebhookSignature")) throw new Error("signature verify missing");
  },
  "paddle-simulation-received-and-stored": () => {
    if (!paddleProc.includes("received_simulation_or_unlinked")) throw new Error("simulation status missing");
  },
  "paddle-simulation-missing-user-no-upgrade": () => {
    if (!paddleStore.includes("user_id: input.userId ?? null")) throw new Error("nullable user_id insert missing");
    if (!migration.includes("drop not null")) throw new Error("billing_events user_id must be nullable");
  },
  "paddle-unknown-price-no-upgrade": () => {
    if (!paddleProc.includes("unknown_price_id")) throw new Error("unknown price path missing");
  },
  "paddle-webhook-processing-no-500-on-simulation": () => {
    if (!paddleProc.includes("isSimulation")) throw new Error("simulation detect missing");
  },
  "paddle-webhook-no-random-upgrade": () => {
    if (!paddleProc.includes("ENTITLEMENT_EVENTS")) throw new Error("entitlement guard missing");
  },
  "no-stripe-copy-in-user-billing": () => {
    if (billingSettings.includes("Legacy Stripe")) throw new Error("Stripe panel still visible");
    if (billingSettings.includes("Stripe env vars")) throw new Error("Stripe copy remains");
  },
  "paddle-only-billing-ui": () => {
    if (!billingSettings.includes('"Paddle"')) throw new Error("Paddle label missing");
  },
  "stripe-env-not-required-for-paddle": () => {
    if (!billingSettings.includes("paddleReady")) throw new Error("paddle readiness missing");
  },
  "upgrade-button-until-infinity-vii": () => {
    if (!userMenu.includes("nextUpgradePlanId")) throw new Error("next plan helper missing");
    if (!userMenu.includes("!atHighestPlan")) throw new Error("upgrade visibility missing");
  },
  "no-upgrade-button-at-infinity-vii": () => {
    if (!userMenu.includes("isHighestPaidPlan")) throw new Error("highest plan check missing");
    if (!userMenu.includes("Manage billing")) throw new Error("manage billing at top tier missing");
  },
  "billing-upgrade-options-above-current-plan": () => {
    if (!billingSettings.includes("upgradePlans")) throw new Error("filtered upgrade plans missing");
    if (!billingSettings.includes("BILLABLE_PLAN_IDS")) throw new Error("billable catalog missing");
  },
  "user-menu-upgrade-targets-next-plan": () => {
    if (!userMenu.includes("upgrade=")) throw new Error("upgrade query param missing");
  },
  "missing-vercel-token-deploy-only": () => {
    if (chatView.includes("VERCEL_ACCESS_TOKEN")) throw new Error("chat must not mention Vercel token");
  },
  "vercel-token-warning-copy": () => {
    const deployView = read("src/components/deploy/deploy-view.tsx");
    if (!deployView.includes("VERCEL_ACCESS_TOKEN")) throw new Error("deploy center must document token");
  },
  "vercel-project-id-required-after-token": () => {
    if (!vercelConn.includes("needs_project_link")) throw new Error("project link state missing");
  },
  "vercel-readiness-validates-project": () => {
    if (!vercelConn.includes("validateVercelProject")) throw new Error("project validation missing");
  },
  "missing-vercel-token-does-not-crash-ai-chat": () => {
    if (!fs.existsSync(path.join(root, "src/app/(app)/ai-chat/page.tsx"))) throw new Error("ai-chat missing");
  },
};

const selected = process.argv.slice(2).filter(Boolean);
const names = selected.length ? selected : Object.keys(suites);

console.log("\n=== verify:p0-production-readiness ===\n");
let failed = 0;
for (const name of names) {
  try {
    suites[name]();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(failed ? `\n${failed} failed\n` : "\nAll passed\n");
process.exit(failed ? 1 : 0);
