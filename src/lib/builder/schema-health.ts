import { createServiceRoleClient } from "@/lib/supabase/admin";

const REQUIRED_PROJECT_COLUMNS = [
  "name",
  "slug",
  "description",
  "icon_url",
  "preview_url",
  "published_subdomain",
  "metadata",
  "updated_at",
] as const;

const OPTIONAL_PROJECT_COLUMNS = [
  "app_icon_url",
  "published_url",
  "published_at",
  "publish_status",
  "build_status",
] as const;

const REQUIRED_TABLES = [
  "projects",
  "conversations",
  "messages",
  "app_files",
  "build_jobs",
  "ai_usage_logs",
  "token_ledger",
  "credit_events",
] as const;

const REQUIRED_RPCS = ["charge_tokens", "grant_tokens"] as const;

const MIGRATION_FILE =
  "supabase/migrations/20260528120000_builder_runtime_quality_and_credits.sql";

async function columnExists(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  table: string,
  column: string,
): Promise<boolean> {
  const { error: qErr } = await admin.from(table as "projects").select(column).limit(0);
  return !qErr;
}

export async function checkBuilderSchemaHealth() {
  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      migration_file: MIGRATION_FILE,
      fallback_script: "scripts/builder-runtime-quality-and-credits.sql",
      error: "SUPABASE_SERVICE_ROLE_KEY missing — cannot inspect schema",
      missing_tables: [] as string[],
      missing_columns: [] as string[],
      missing_rpcs: [] as string[],
    };
  }

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingRpcs: string[] = [];

  for (const table of REQUIRED_TABLES) {
    const { error } = await admin.from(table as "projects").select("id").limit(0);
    if (error?.message?.includes("does not exist") || error?.code === "42P01") {
      missingTables.push(table);
    }
  }

  for (const col of REQUIRED_PROJECT_COLUMNS) {
    const ok = await columnExists(admin, "projects", col);
    if (!ok) missingColumns.push(`projects.${col}`);
  }
  for (const col of OPTIONAL_PROJECT_COLUMNS) {
    const ok = await columnExists(admin, "projects", col);
    if (!ok) missingColumns.push(`projects.${col} (recommended)`);
  }

  for (const rpc of REQUIRED_RPCS) {
    const { error } = await admin.rpc(rpc as "charge_tokens", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 0,
      p_reason: "health_check",
      p_idempotency_key: `health_${rpc}`,
      p_metadata: {},
    } as never);
    if (error?.message?.includes("Could not find the function")) {
      missingRpcs.push(rpc);
    }
  }

  const ok =
    missingTables.length === 0 &&
    missingColumns.filter((c) => !c.includes("(recommended)")).length === 0 &&
    missingRpcs.length === 0;

  return {
    ok,
    migration_file: MIGRATION_FILE,
    fallback_script: "scripts/builder-runtime-quality-and-credits.sql",
    missing_tables: missingTables,
    missing_columns: missingColumns,
    missing_rpcs: missingRpcs,
    hint: ok
      ? "Builder runtime schema looks healthy."
      : `Apply ${MIGRATION_FILE} or scripts/builder-runtime-quality-and-credits.sql in Supabase SQL Editor, then NOTIFY pgrst, 'reload schema';`,
  };
}
