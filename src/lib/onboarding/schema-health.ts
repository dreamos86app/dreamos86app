import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  LEDGER_TABLES,
  ONBOARDING_MIGRATION_FILE,
  ONBOARDING_REQUIRED_COLUMNS,
  ONBOARDING_SQL_FALLBACK,
  PROFILE_ONBOARDING_WRITE_FIELDS,
  REFERRAL_TABLES,
} from "@/lib/onboarding/schema";

export type SchemaHealthReport = {
  ok: boolean;
  checked_at: string;
  migration_file: string;
  sql_fallback: string;
  onboarding_table_exists: boolean;
  missing_onboarding_columns: string[];
  missing_profile_columns: string[];
  missing_tables: string[];
  rpc_functions: {
    complete_user_onboarding: boolean;
    claim_referral_reward: boolean;
  };
};

const PROFILE_COLUMNS_TO_CHECK = [...PROFILE_ONBOARDING_WRITE_FIELDS];

async function tableExists(
  admin: ReturnType<typeof createSupabaseAdmin>,
  table: string,
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from(table).select("id").limit(0);
    if (!error) return true;
    const m = error.message.toLowerCase();
    return !m.includes("could not find the table") && !m.includes("does not exist");
  } catch {
    return false;
  }
}

async function columnProbe(
  admin: ReturnType<typeof createSupabaseAdmin>,
  table: "onboarding" | "profiles",
  column: string,
): Promise<boolean> {
  const { error } = await admin.from(table).select(column).limit(0);
  if (!error) return true;
  return !error.message.toLowerCase().includes("column") && !error.message.includes("schema cache");
}

export async function checkOnboardingSchemaHealth(): Promise<SchemaHealthReport> {
  const admin = createSupabaseAdmin();
  const checked_at = new Date().toISOString();

  const onboardingExists = await tableExists(admin, "onboarding");

  const missing_onboarding_columns: string[] = [];
  if (onboardingExists) {
    for (const col of ONBOARDING_REQUIRED_COLUMNS) {
      if (col === "user_id") continue;
      const ok = await columnProbe(admin, "onboarding", col);
      if (!ok) missing_onboarding_columns.push(col);
    }
  } else {
    missing_onboarding_columns.push("(entire table missing)");
  }

  const missing_profile_columns: string[] = [];
  for (const col of PROFILE_COLUMNS_TO_CHECK) {
    const ok = await columnProbe(admin, "profiles", col);
    if (!ok) missing_profile_columns.push(col);
  }

  const missing_tables: string[] = [];
  for (const t of [...REFERRAL_TABLES, ...LEDGER_TABLES]) {
    const exists = await tableExists(admin, t);
    if (!exists) missing_tables.push(t);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcCompleteErr } = await (admin as any).rpc("complete_user_onboarding", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_hear_about: "probe",
    p_build_first: "probe",
    p_replay: false,
  });

  const complete_user_onboarding =
    !rpcCompleteErr ||
    (!rpcCompleteErr.message.includes("complete_user_onboarding") &&
      rpcCompleteErr.code !== "PGRST202");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcClaimErr } = await (admin as any).rpc("claim_referral_reward", {
    p_referred_id: "00000000-0000-0000-0000-000000000000",
    p_credits: 20,
  });

  const claim_referral_reward =
    !rpcClaimErr || !rpcClaimErr.message.includes("claim_referral_reward");

  const ok =
    onboardingExists &&
    missing_onboarding_columns.length === 0 &&
    missing_profile_columns.length === 0 &&
    missing_tables.length === 0 &&
    complete_user_onboarding &&
    claim_referral_reward;

  return {
    ok,
    checked_at,
    migration_file: ONBOARDING_MIGRATION_FILE,
    sql_fallback: ONBOARDING_SQL_FALLBACK,
    onboarding_table_exists: onboardingExists,
    missing_onboarding_columns,
    missing_profile_columns,
    missing_tables,
    rpc_functions: {
      complete_user_onboarding,
      claim_referral_reward,
    },
  };
}
