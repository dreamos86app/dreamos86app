import { NextResponse } from "next/server";
import { requireDreamosOwner } from "@/lib/admin/require-owner";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";
import { getSupabasePublicUrl } from "@/lib/supabase/auth-domain";

export const dynamic = "force-dynamic";

const RUNTIME_TABLES = [
  "profiles",
  "projects",
  "conversations",
  "messages",
  "build_jobs",
  "app_files",
  "ai_usage_logs",
  "credit_events",
  "token_ledger",
  "project_integrations",
  "project_secrets",
  "subscriptions",
  "admin_actions",
] as const;

const PROFILE_COLUMN_PROBE = [
  "id",
  "email",
  "plan_id",
  "plan_interval",
  "credits_remaining",
  "credits_limit",
  "credits_used",
  "credits_reset_at",
  "onboarding_completed",
  "workspace_name",
  "full_name",
  "username",
  "avatar_url",
  "role",
  "stripe_customer_id",
  "default_model_id",
  "preferred_model",
  "experience_level",
  "onboarding_step",
  "onboarding_answers",
  "signup_wizard_completed",
  "referral_code",
  "referred_by",
  "created_at",
  "updated_at",
  "subscription_status",
  "account_status",
  "monthly_token_limit",
  "tokens_remaining",
  "is_admin",
] as const;

function projectRefFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? null;
}

async function probeTableExists(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  table: string,
): Promise<boolean> {
  const { error } = await admin.from(table as "profiles").select("id").limit(0);
  if (!error) return true;
  const m = error.message.toLowerCase();
  return !m.includes("could not find the table") && !m.includes("does not exist");
}

async function probeColumn(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  column: string,
): Promise<boolean> {
  const { error } = await admin.from("profiles").select(column).limit(0);
  return !error;
}

async function probeRpc(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  fn: string,
): Promise<boolean> {
  if (fn === "charge_tokens") {
    const { error } = await admin.rpc("charge_tokens", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 0,
      p_reason: "debug_schema_probe",
      p_idempotency_key: `debug_${Date.now()}`,
      p_metadata: {},
    } as never);
    if (!error) return true;
    return !error.message.includes("Could not find the function");
  }
  if (fn === "ensure_user_profile") {
    const { error } = await admin.rpc(
      "ensure_user_profile" as "charge_tokens",
      {
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_email: null,
      } as never,
    );
    if (!error) return true;
    return !error.message.includes("Could not find the function");
  }
  return false;
}

export async function GET() {
  const gate = await requireDreamosOwner();
  if (gate.error) return gate.error;

  const supabaseUrl = getSupabasePublicUrl();
  const projectRef = projectRefFromUrl(supabaseUrl);
  const appUrl = getAppUrl();
  const admin = createServiceRoleClient();

  const missingItems: string[] = [];

  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        projectRef,
        appUrl,
        supabaseUrlHost: supabaseUrl ? new URL(supabaseUrl).host : null,
        error: "SUPABASE_SERVICE_ROLE_KEY not configured",
        missingItems: ["service_role_client"],
      },
      { status: 503 },
    );
  }

  const tables: Record<string, boolean> = {};
  for (const table of RUNTIME_TABLES) {
    const exists = await probeTableExists(admin, table);
    tables[table] = exists;
    if (!exists) missingItems.push(`table:${table}`);
  }

  const planIntervalPostgrest = await probeColumn(admin, "plan_interval");
  if (!planIntervalPostgrest) missingItems.push("column:profiles.plan_interval");

  const profileColumns: string[] = [];
  for (const col of PROFILE_COLUMN_PROBE.slice(0, 30)) {
    if (await probeColumn(admin, col)) profileColumns.push(col);
    else if (col === "plan_interval") {
      /* already tracked */
    }
  }

  const rpcChargeTokens = await probeRpc(admin, "charge_tokens");
  const rpcEnsureUserProfile = await probeRpc(admin, "ensure_user_profile");
  if (!rpcChargeTokens) missingItems.push("rpc:charge_tokens");
  if (!rpcEnsureUserProfile) missingItems.push("rpc:ensure_user_profile");

  const ok = missingItems.length === 0;

  return NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      projectRef,
      appUrl,
      supabaseUrlHost: supabaseUrl ? new URL(supabaseUrl).host : null,
      profiles: {
        planIntervalColumnPostgrest: planIntervalPostgrest,
        planIntervalSelectable: planIntervalPostgrest,
        columnsVisibleToPostgrest: profileColumns,
        columnCount: profileColumns.length,
      },
      tables,
      rpcs: {
        charge_tokens: rpcChargeTokens,
        ensure_user_profile: rpcEnsureUserProfile,
      },
      missingItems,
      note:
        "Column/table probes use PostgREST (service role). Stale schema cache can hide DB columns until NOTIFY pgrst, 'reload schema';",
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
