/**
 * Single source-of-truth runtime schema contract.
 * Keep in sync with scripts/dreamos-runtime-repair.sql and supabase migrations.
 */

export const RUNTIME_CONTRACT_MIGRATION =
  "supabase/migrations/20260624120000_runtime_contract_repair.sql";

export const RUNTIME_REPAIR_SQL_FILE = "scripts/dreamos-runtime-repair.sql";

/** Tables required for core product runtime (AI, credits, import, builder). */
export const CRITICAL_TABLES = [
  "profiles",
  "credit_events",
  "projects",
  "conversations",
  "messages",
  "app_files",
  "build_jobs",
  "published_apps",
] as const;

/** Admin / diagnostics tables — missing is a warning, not a global blocker. */
export const OPTIONAL_ADMIN_TABLES = [
  "admin_audit_logs",
  "admin_pending_confirmations",
  "runtime_diagnostics",
  "token_ledger",
  "ai_usage_logs",
  "credit_reservations",
  "provider_usage_logs",
  "imported_projects",
] as const;

export const CRITICAL_COLUMNS: Record<string, readonly string[]> = {
  app_files: [
    "id",
    "project_id",
    "path",
    "content",
    "language",
    "file_type",
    "metadata",
    "mime_type",
    "size_bytes",
    "source",
    "import_id",
    "storage_path",
    "encoding",
    "content_hash",
    "owner_id",
    "created_at",
    "updated_at",
  ],
  profiles: [
    "id",
    "email",
    "plan_id",
    "credits_remaining",
    "credits_limit",
    "monthly_token_limit",
    "created_at",
    "updated_at",
  ],
  credit_events: [
    "id",
    "user_id",
    "operation_id",
    "event_type",
    "mode",
    "model_id",
    "credits_consumed",
    "provider_cost_usd",
    "status",
    "metadata",
    "created_at",
  ],
};

/** PostgREST must expose these columns for ZIP import. */
export const ZIP_IMPORT_REST_COLUMNS = ["mime_type", "size_bytes", "source"] as const;

export type RpcContract = {
  name: string;
  /** Named args expected by app code (PostgREST RPC body keys). */
  args: readonly string[];
  /** Required for paid AI / billing — blocks operations when missing. */
  critical: boolean;
};

export const RUNTIME_RPC_CONTRACTS: RpcContract[] = [
  {
    name: "charge_tokens",
    args: [
      "p_user_id",
      "p_amount",
      "p_reason",
      "p_project_id",
      "p_conversation_id",
      "p_idempotency_key",
      "p_metadata",
    ],
    critical: true,
  },
  {
    name: "ensure_user_profile",
    args: ["p_user_id", "p_email"],
    critical: true,
  },
  {
    name: "charge_credits",
    args: ["p_user_id", "p_amount", "p_reason", "p_idempotency_key"],
    critical: false,
  },
  {
    name: "grant_tokens",
    args: ["p_user_id", "p_amount", "p_reason", "p_source", "p_metadata", "p_idempotency_key"],
    critical: false,
  },
  {
    name: "grant_credits",
    args: ["p_admin_id", "p_user_id", "p_amount", "p_reason"],
    critical: false,
  },
  {
    name: "grant_credits_admin",
    args: ["p_admin_id", "p_user_id", "p_amount", "p_reason"],
    critical: false,
  },
  {
    name: "complete_user_onboarding",
    args: ["p_user_id"],
    critical: false,
  },
  {
    name: "claim_referral_reward",
    args: ["p_user_id"],
    critical: false,
  },
  {
    name: "dreamos_debug_credit_rpc",
    args: [],
    critical: false,
  },
];

export const CRITICAL_RPC_NAMES = RUNTIME_RPC_CONTRACTS.filter((r) => r.critical).map((r) => r.name);

export const OPTIONAL_RPC_NAMES = RUNTIME_RPC_CONTRACTS.filter((r) => !r.critical).map((r) => r.name);

export function isOptionalAdminTable(table: string): boolean {
  return (OPTIONAL_ADMIN_TABLES as readonly string[]).includes(table);
}

export function isOptionalRpc(rpc: string): boolean {
  return (OPTIONAL_RPC_NAMES as readonly string[]).includes(rpc);
}

export function isCriticalRpc(rpc: string): boolean {
  return (CRITICAL_RPC_NAMES as readonly string[]).includes(rpc);
}

/** PostgREST schema cache reload — required after DDL in Supabase SQL Editor. */
export const PGRST_RELOAD_SQL = "NOTIFY pgrst, 'reload schema';";
