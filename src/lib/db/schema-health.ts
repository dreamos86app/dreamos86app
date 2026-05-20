/**
 * Runtime + admin schema health — single source of truth for /api/admin/schema-health.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type SchemaMissingItem = {
  type: "table" | "column" | "rpc";
  table?: string;
  column?: string;
  rpc?: string;
  hint?: string;
};

export type SchemaHealthResult = {
  ok: boolean;
  missing: SchemaMissingItem[];
  projectRef: string | null;
  checkedAt: string;
  migrationHint: string;
  tablesChecked: number;
  chargeTokensRpc: boolean;
};

const MIGRATION_HINT =
  "Run supabase/migrations/20260601120000_create_builder_product_compat.sql, scripts/full-runtime-schema-repair.sql, scripts/admin-column-compat.sql, then NOTIFY pgrst, 'reload schema';";

/** Columns probed per table (idempotent migrations may add these over time). */
export const REQUIRED_SCHEMA: Record<string, readonly string[]> = {
  profiles: [
    "id",
    "email",
    "credits_remaining",
    "credits_limit",
    "credits_used",
    "credits_reset_at",
    "plan_id",
    "plan_interval",
    "subscription_status",
  ],
  ai_usage_logs: [
    "id",
    "user_id",
    "user_email",
    "project_id",
    "conversation_id",
    "message_id",
    "provider",
    "model_id",
    "mode",
    "operation_id",
    "tokens_input",
    "tokens_output",
    "tokens_charged",
    "credits_charged",
    "error_message",
    "created_at",
  ],
  admin_actions: [
    "id",
    "admin_id",
    "user_id",
    "target_user_id",
    "action",
    "action_type",
    "amount",
    "reason",
    "metadata",
    "created_at",
  ],
  subscriptions: [
    "id",
    "user_id",
    "plan_id",
    "status",
    "stripe_customer_id",
    "stripe_subscription_id",
    "stripe_price_id",
    "current_period_end",
    "cancel_at_period_end",
    "pending_downgrade",
  ],
  projects: [
    "id",
    "owner_id",
    "user_id",
    "name",
    "app_name",
    "slug",
    "description",
    "icon_url",
    "icon_svg",
    "status",
    "build_status",
    "last_build_id",
    "last_build_at",
    "preview_url",
    "live_url",
    "metadata",
  ],
  build_jobs: [
    "id",
    "project_id",
    "user_id",
    "status",
    "mode",
    "prompt",
    "model_id",
    "provider",
    "credits_estimated",
    "credits_charged",
    "file_count",
    "error_message",
    "completed_at",
    "failed_at",
  ],
  app_files: ["id", "project_id", "build_id", "path", "content", "language", "action"],
  project_integrations: [
    "id",
    "project_id",
    "owner_id",
    "provider",
    "display_name",
    "status",
    "connected_at",
    "last_tested_at",
    "last_error",
    "metadata",
  ],
  project_secrets: [
    "id",
    "project_id",
    "owner_id",
    "provider",
    "key",
    "encrypted_value",
    "masked_value",
  ],
  preview_errors: [
    "id",
    "project_id",
    "build_id",
    "severity",
    "message",
    "file_path",
    "line",
  ],
  publish_records: [
    "id",
    "project_id",
    "build_id",
    "user_id",
    "status",
    "url",
    "subdomain",
    "custom_domain",
    "published_at",
  ],
  conversations: ["id", "user_id", "project_id", "title", "mode", "status"],
  messages: ["id", "conversation_id", "project_id", "user_id", "role", "content", "mode"],
};

const REQUIRED_RPCS = ["charge_tokens"] as const;

function projectRefFromEnv(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? null;
}

function isTableMissingError(message: string, code?: string): boolean {
  const m = message.toLowerCase();
  return (
    code === "42P01" ||
    m.includes("does not exist") ||
    m.includes("could not find the table")
  );
}

function parseMissingColumnsFromError(message: string, columns: readonly string[]): string[] {
  const m = message.toLowerCase();
  const missing: string[] = [];
  for (const col of columns) {
    if (m.includes(col.toLowerCase())) missing.push(col);
  }
  if (missing.length > 0) return missing;
  if (m.includes("column") || m.includes("schema cache")) return [...columns];
  return [];
}

async function probeTableColumns(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  table: string,
  columns: readonly string[],
): Promise<{ tableMissing: boolean; missingColumns: string[] }> {
  const select = columns.join(",");
  const { error } = await admin.from(table as "projects").select(select).limit(0);

  if (!error) return { tableMissing: false, missingColumns: [] };

  if (isTableMissingError(error.message, error.code)) {
    return { tableMissing: true, missingColumns: [] };
  }

  const missingColumns = parseMissingColumnsFromError(error.message, columns);
  if (missingColumns.length > 0) {
    return { tableMissing: false, missingColumns };
  }

  return { tableMissing: false, missingColumns: [...columns] };
}

async function probeChargeTokensRpc(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
): Promise<boolean> {
  const { error } = await admin.rpc("charge_tokens", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_amount: 0,
    p_reason: "schema_health_probe",
    p_idempotency_key: `health_charge_${Date.now()}`,
    p_metadata: {},
  } as never);

  if (!error) return true;
  if (error.message?.includes("Could not find the function")) return false;
  return true;
}

export async function checkRuntimeSchemaHealth(): Promise<SchemaHealthResult> {
  const checkedAt = new Date().toISOString();
  const projectRef = projectRefFromEnv();
  const admin = createServiceRoleClient();

  if (!admin) {
    return {
      ok: false,
      missing: [
        {
          type: "table",
          table: "(service)",
          hint: "Set SUPABASE_SERVICE_ROLE_KEY in server env",
        },
      ],
      projectRef,
      checkedAt,
      migrationHint: MIGRATION_HINT,
      tablesChecked: 0,
      chargeTokensRpc: false,
    };
  }

  const missing: SchemaMissingItem[] = [];
  let tablesChecked = 0;

  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    tablesChecked += 1;
    const result = await probeTableColumns(admin, table, columns);
    if (result.tableMissing) {
      missing.push({
        type: "table",
        table,
        hint: `CREATE TABLE public.${table} — see scripts/full-runtime-schema-repair.sql`,
      });
      continue;
    }
    for (const col of result.missingColumns) {
      missing.push({
        type: "column",
        table,
        column: col,
        hint: `ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${col} …`,
      });
    }
  }

  let chargeTokensRpc = false;
  for (const rpc of REQUIRED_RPCS) {
    if (rpc === "charge_tokens") {
      chargeTokensRpc = await probeChargeTokensRpc(admin);
      if (!chargeTokensRpc) {
        missing.push({
          type: "rpc",
          rpc,
          hint: "Apply supabase/migrations/20260602120000_runtime_profile_credit_publish_compat.sql",
        });
      }
    }
  }

  const ensureProbe = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/ensure_user_profile`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_email: "probe@dreamos86.local",
      }),
    },
  );
  if (ensureProbe.status === 404) {
    missing.push({
      type: "rpc",
      rpc: "ensure_user_profile",
      hint: "Apply supabase/migrations/20260602120000_runtime_profile_credit_publish_compat.sql",
    });
  }

  return {
    ok: missing.length === 0,
    missing,
    projectRef,
    checkedAt,
    migrationHint: MIGRATION_HINT,
    tablesChecked,
    chargeTokensRpc,
  };
}
