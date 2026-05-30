import { createServiceRoleClient } from "@/lib/supabase/admin";
import { safeFetch } from "@/lib/network/safe-fetch";
import {
  buildChargeTokensProbePayload,
  CANONICAL_CHARGE_TOKENS_PG_ARGS,
  CANONICAL_ENSURE_USER_PROFILE_PG_ARGS,
  CHARGE_TOKENS_DUPLICATE_OVERLOADS_MESSAGE,
  CHARGE_TOKENS_MISSING_PG_MESSAGE,
  CHARGE_TOKENS_STALE_POSTGREST_MESSAGE,
  CHARGE_TOKENS_WRONG_SIGNATURE_MESSAGE,
  ENSURE_USER_PROFILE_VOID_MESSAGE,
  type ChargeTokensRpcPayload,
  getSupabaseEnvSource,
  isCanonicalChargeTokensArgs,
  isCanonicalEnsureUserProfileArgs,
  type PgProcSignature,
  projectRefFromSupabaseUrl,
  supabaseUrlHost,
} from "@/lib/db/charge-tokens-rpc";

export type CreditBillingTablesState = {
  profiles: boolean;
  credit_events: boolean;
  token_ledger: boolean;
  ai_usage_logs: boolean;
};

export type ChargeTokensIssueKind =
  | "ok"
  | "missing_in_postgres"
  | "stale_postgrest"
  | "duplicate_overloads"
  | "wrong_pg_signature"
  | "ensure_void_return"
  | "tables_missing"
  | "service_role_missing"
  | "permission_denied"
  | "catalog_unavailable"
  | "unknown";

export type ChargeTokensProbeResult = {
  ok: boolean;
  tables: CreditBillingTablesState;
  postgresExists: boolean;
  postgresCatalogReadable: boolean;
  postgresSignatures: PgProcSignature[];
  postgresCanonical: boolean;
  postgresDuplicateOverloads: boolean;
  ensureUserProfilePostgresExists: boolean;
  ensureUserProfileSignatures: PgProcSignature[];
  ensureUserProfileCanonical: boolean;
  ensureUserProfileReturnsVoid: boolean;
  catalogProbeError: string | null;
  postgrestCallable: boolean;
  postgrestHttpStatus: number | null;
  postgrestError: string | null;
  postgrestData: unknown;
  serviceRoleExecutable: boolean;
  serviceRoleError: string | null;
  serviceRoleResponsePreview: unknown;
  issue: ChargeTokensIssueKind;
  diagnosis: string;
  nextAction: string;
  userMessage: string;
  actionHint: string;
  lastError: string | null;
  hint: string | null;
  testPayload: ChargeTokensRpcPayload;
};

type RawSig = {
  args?: string;
  identity_args?: string;
  returns?: string;
  arg_names?: string[] | null;
};

type DreamosDebugCreditRpc = {
  profiles_exists?: boolean;
  credit_events_exists?: boolean;
  token_ledger_exists?: boolean;
  ai_usage_logs_exists?: boolean;
  charge_tokens_signatures?: RawSig[];
  ensure_user_profile_signatures?: RawSig[];
};

function isMissingFunctionError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find the function") ||
    m.includes("function public.charge_tokens") ||
    (m.includes("schema cache") && m.includes("charge_tokens")) ||
    m.includes("pgrst202") ||
    m.includes("404")
  );
}

function isPermissionDenied(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("permission denied");
}

/** invalid_amount / insufficient / idempotent in message or JSON body = function executed. */
export function isRpcProbeValidationOk(message: string | undefined, data: unknown): boolean {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const err = typeof d.error === "string" ? d.error.toLowerCase() : "";
    if (
      err === "invalid_amount" ||
      err === "insufficient_credits" ||
      err === "user_id_required" ||
      err === "no_pending_referral" ||
      err === "already_rewarded" ||
      err === "already_completed" ||
      err === "forbidden" ||
      d.idempotent === true ||
      d.charged === true ||
      d.ok === true ||
      d.success === true
    ) {
      return true;
    }
  }
  if (!message) return data != null;
  if (isMissingFunctionError(message)) return false;
  if (isPermissionDenied(message)) return false;
  const m = message.toLowerCase();
  if (
    m.includes("invalid_amount") ||
    m.includes("insufficient") ||
    m.includes("idempotent") ||
    m.includes("user_id_required") ||
    m.includes("no_pending_referral") ||
    m.includes("already_rewarded") ||
    m.includes("already_completed") ||
    m.includes("foreign key constraint") ||
    m.includes("violates foreign key")
  ) {
    return true;
  }
  return !isMissingFunctionError(message);
}

/** @deprecated use isRpcProbeValidationOk */
const isExecutableResponse = isRpcProbeValidationOk;

function normalizeSignatures(raw: RawSig[] | undefined): PgProcSignature[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    args: (s.args ?? s.identity_args ?? "").trim(),
    returns: (s.returns ?? "unknown").trim(),
    arg_names: Array.isArray(s.arg_names)
      ? s.arg_names.filter((n): n is string => typeof n === "string")
      : [],
  }));
}

async function probeBillingTables(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
): Promise<CreditBillingTablesState> {
  const tables = ["profiles", "credit_events", "token_ledger", "ai_usage_logs"] as const;
  const out = {} as CreditBillingTablesState;
  for (const table of tables) {
    const { error } = await admin.from(table).select("id").limit(0);
    const missing =
      error &&
      (error.code === "42P01" ||
        error.message.toLowerCase().includes("does not exist") ||
        error.message.toLowerCase().includes("could not find the table"));
    out[table] = !missing;
  }
  return out;
}

async function probePostgresCatalog(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
): Promise<{
  catalogReadable: boolean;
  chargeSignatures: PgProcSignature[];
  ensureSignatures: PgProcSignature[];
  catalogProbeError: string | null;
  tablesFromDebug: Partial<CreditBillingTablesState>;
}> {
  const { data, error } = await admin.rpc("dreamos_debug_credit_rpc" as never);
  if (!error && data && typeof data === "object") {
    const parsed = data as DreamosDebugCreditRpc;
    return {
      catalogReadable: true,
      chargeSignatures: normalizeSignatures(parsed.charge_tokens_signatures),
      ensureSignatures: normalizeSignatures(parsed.ensure_user_profile_signatures),
      catalogProbeError: null,
      tablesFromDebug: {
        profiles: parsed.profiles_exists,
        credit_events: parsed.credit_events_exists,
        token_ledger: parsed.token_ledger_exists,
        ai_usage_logs: parsed.ai_usage_logs_exists,
      },
    };
  }

  return {
    catalogReadable: false,
    chargeSignatures: [],
    ensureSignatures: [],
    catalogProbeError:
      error?.message ??
      "dreamos_debug_credit_rpc is not in PostgREST schema cache — run Copy SQL fix, then Reload schema",
    tablesFromDebug: {},
  };
}

async function probePostgrestRest(
  url: string,
  key: string,
  payload: ChargeTokensRpcPayload,
): Promise<{ callable: boolean; httpStatus: number; error: string | null; data: unknown }> {
  const { response: res, error: fetchErr } = await safeFetch(
    `${url}/rest/v1/rpc/charge_tokens`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "probe_charge_tokens_postgrest",
  );

  if (!res) {
    return {
      callable: false,
      httpStatus: 0,
      error: fetchErr?.message ?? "rest_probe_failed",
      data: null,
    };
  }

  try {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const errMsg =
      (typeof body.message === "string" ? body.message : null) ??
      (typeof body.error === "string" ? body.error : null) ??
      (res.ok ? null : `HTTP ${res.status}`);
    const callable =
      isExecutableResponse(errMsg ?? undefined, body) && !isMissingFunctionError(errMsg ?? "");
    return {
      callable,
      httpStatus: res.status,
      error: errMsg,
      data: body,
    };
  } catch (e) {
    return {
      callable: false,
      httpStatus: 0,
      error: e instanceof Error ? e.message : "rest_probe_failed",
      data: null,
    };
  }
}

function analyzeCatalog(chargeSigs: PgProcSignature[], ensureSigs: PgProcSignature[]) {
  const postgresExists = chargeSigs.length > 0;
  const postgresDuplicateOverloads = chargeSigs.length > 1;
  const postgresCanonical =
    chargeSigs.length === 1 && isCanonicalChargeTokensArgs(chargeSigs[0].args);
  const wrongPgSignature = postgresExists && !postgresCanonical;

  const ensureUserProfilePostgresExists = ensureSigs.length > 0;
  const ensureUserProfileCanonical =
    ensureSigs.length === 1 &&
    isCanonicalEnsureUserProfileArgs(ensureSigs[0].args) &&
    ensureSigs[0].returns.toLowerCase() === "jsonb";
  const ensureUserProfileReturnsVoid = ensureSigs.some((s) =>
    s.returns.toLowerCase().includes("void"),
  );

  return {
    postgresExists,
    postgresDuplicateOverloads,
    postgresCanonical,
    wrongPgSignature,
    ensureUserProfilePostgresExists,
    ensureUserProfileCanonical,
    ensureUserProfileReturnsVoid,
  };
}

function classifyIssue(input: {
  tables: CreditBillingTablesState;
  catalogReadable: boolean;
  postgresExists: boolean;
  postgresDuplicateOverloads: boolean;
  wrongPgSignature: boolean;
  ensureUserProfileReturnsVoid: boolean;
  postgrestCallable: boolean;
  serviceRoleExecutable: boolean;
  postgrestError: string | null;
  serviceRoleError: string | null;
  catalogProbeError: string | null;
}): Pick<
  ChargeTokensProbeResult,
  "ok" | "issue" | "diagnosis" | "nextAction" | "userMessage" | "actionHint"
> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      issue: "service_role_missing",
      diagnosis: "SUPABASE_SERVICE_ROLE_KEY is not set on the DreamOS86 server.",
      nextAction: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server or redeploy.",
      userMessage: "Service role key missing — cannot probe or charge credits.",
      actionHint: "Configure SUPABASE_SERVICE_ROLE_KEY (server-only), then Refresh check.",
    };
  }

  const billingTablesOk =
    input.tables.profiles &&
    input.tables.credit_events &&
    input.tables.token_ledger &&
    input.tables.ai_usage_logs;

  if (!billingTablesOk) {
    const missing = (["profiles", "credit_events", "token_ledger", "ai_usage_logs"] as const)
      .filter((t) => !input.tables[t])
      .join(", ");
    return {
      ok: false,
      issue: "tables_missing",
      diagnosis: `Billing tables missing or not visible to service role: ${missing}.`,
      nextAction: "Copy SQL fix → paste in Supabase SQL Editor → Run entire file → Reload schema → Verify.",
      userMessage: `Billing tables missing (${missing}). Run Copy SQL fix.`,
      actionHint: "Run the full credit billing SQL patch in Supabase SQL Editor.",
    };
  }

  if (input.ensureUserProfileReturnsVoid) {
    return {
      ok: false,
      issue: "ensure_void_return",
      diagnosis: ENSURE_USER_PROFILE_VOID_MESSAGE,
      nextAction: "Copy SQL fix and run the entire patch (dynamic DROP block removes void overloads).",
      userMessage: ENSURE_USER_PROFILE_VOID_MESSAGE,
      actionHint: "Run Copy SQL fix in Supabase SQL Editor.",
    };
  }

  if (input.postgresDuplicateOverloads) {
    return {
      ok: false,
      issue: "duplicate_overloads",
      diagnosis: CHARGE_TOKENS_DUPLICATE_OVERLOADS_MESSAGE,
      nextAction: "Copy SQL fix — the DO block drops every charge_tokens overload before recreate.",
      userMessage: CHARGE_TOKENS_DUPLICATE_OVERLOADS_MESSAGE,
      actionHint: "Run Copy SQL fix, then NOTIFY pgrst, 'reload schema'; wait 60s.",
    };
  }

  if (input.wrongPgSignature) {
    return {
      ok: false,
      issue: "wrong_pg_signature",
      diagnosis: CHARGE_TOKENS_WRONG_SIGNATURE_MESSAGE,
      nextAction: "Copy SQL patch — recreates charge_tokens (p_user_id uuid first) returning jsonb.",
      userMessage: CHARGE_TOKENS_WRONG_SIGNATURE_MESSAGE,
      actionHint: "Run Copy SQL fix, then Reload schema.",
    };
  }

  if (
    input.postgresExists &&
    input.postgrestCallable &&
    input.serviceRoleExecutable
  ) {
    return {
      ok: true,
      issue: "ok",
      diagnosis: "charge_tokens is installed in pg_proc with the canonical signature and PostgREST can execute it.",
      nextAction: "",
      userMessage: "Credit billing RPC is healthy.",
      actionHint: "",
    };
  }

  const lastErr = input.serviceRoleError ?? input.postgrestError ?? input.catalogProbeError ?? "";
  if (isPermissionDenied(lastErr)) {
    return {
      ok: false,
      issue: "permission_denied",
      diagnosis: "PostgREST reached charge_tokens but GRANT EXECUTE may be missing for service_role.",
      nextAction: "Re-run Copy SQL fix (includes REVOKE/GRANT), then Reload schema.",
      userMessage: "Permission denied calling charge_tokens.",
      actionHint: "Run Copy SQL fix grant section, then Reload schema.",
    };
  }

  if (!input.postgresExists && input.catalogReadable) {
    return {
      ok: false,
      issue: "missing_in_postgres",
      diagnosis: CHARGE_TOKENS_MISSING_PG_MESSAGE,
      nextAction: "Copy SQL fix → Supabase SQL Editor → run entire file.",
      userMessage: CHARGE_TOKENS_MISSING_PG_MESSAGE,
      actionHint: "Run Copy SQL fix in Supabase SQL Editor.",
    };
  }

  if (
    input.postgresExists &&
    (!input.postgrestCallable || !input.serviceRoleExecutable)
  ) {
    return {
      ok: false,
      issue: "stale_postgrest",
      diagnosis: CHARGE_TOKENS_STALE_POSTGREST_MESSAGE,
      nextAction:
        "Click Reload schema, or run NOTIFY pgrst, 'reload schema'; in SQL Editor, wait 60 seconds, then Verify charge_tokens.",
      userMessage: CHARGE_TOKENS_STALE_POSTGREST_MESSAGE,
      actionHint: "Reload schema, wait 60s, Verify again. Use Debug RPC JSON for details.",
    };
  }

  if (!input.catalogReadable) {
    const schemaCache =
      isMissingFunctionError(lastErr) ||
      (input.postgrestError ?? "").toLowerCase().includes("schema cache");
    if (schemaCache && billingTablesOk) {
      return {
        ok: false,
        issue: "catalog_unavailable",
        diagnosis:
          "Cannot read pg_proc via dreamos_debug_credit_rpc (not in PostgREST cache). PostgREST also cannot call charge_tokens — likely patch not applied or cache stale.",
        nextAction: "Copy SQL fix → run in Supabase → wait for NOTIFY → Reload schema → Verify.",
        userMessage: CHARGE_TOKENS_STALE_POSTGREST_MESSAGE,
        actionHint: "Run Copy SQL fix, then Reload schema and wait 60 seconds.",
      };
    }
    if (!input.postgresExists) {
      return {
        ok: false,
        issue: "missing_in_postgres",
        diagnosis:
          "pg_catalog could not be read and charge_tokens is not callable — apply the SQL patch.",
        nextAction: "Copy SQL fix → Supabase SQL Editor → run entire file.",
        userMessage: CHARGE_TOKENS_MISSING_PG_MESSAGE,
        actionHint: "Run Copy SQL fix.",
      };
    }
  }

  return {
    ok: false,
    issue: "unknown",
    diagnosis: lastErr || "charge_tokens is not callable",
    nextAction: "Open Debug RPC JSON, run Copy SQL fix, Reload schema.",
    userMessage: lastErr || "charge_tokens is not callable",
    actionHint: "Copy SQL fix → Supabase SQL Editor → Reload schema → Verify.",
  };
}

/**
 * Full charge_tokens diagnostic — tables, pg_proc (A), PostgREST (B) checked separately.
 */
export async function probeChargeTokensRpcDetailed(): Promise<ChargeTokensProbeResult> {
  const testPayload = buildChargeTokensProbePayload({
    p_idempotency_key: `probe_${Date.now()}`,
  });

  const admin = createServiceRoleClient();
  if (!admin) {
    const emptyTables: CreditBillingTablesState = {
      profiles: false,
      credit_events: false,
      token_ledger: false,
      ai_usage_logs: false,
    };
    const classified = classifyIssue({
      tables: emptyTables,
      catalogReadable: false,
      postgresExists: false,
      postgresDuplicateOverloads: false,
      wrongPgSignature: false,
      ensureUserProfileReturnsVoid: false,
      postgrestCallable: false,
      serviceRoleExecutable: false,
      postgrestError: null,
      serviceRoleError: "SUPABASE_SERVICE_ROLE_KEY not configured",
      catalogProbeError: null,
    });
    return {
      ok: false,
      tables: emptyTables,
      postgresExists: false,
      postgresCatalogReadable: false,
      postgresSignatures: [],
      postgresCanonical: false,
      postgresDuplicateOverloads: false,
      ensureUserProfilePostgresExists: false,
      ensureUserProfileSignatures: [],
      ensureUserProfileCanonical: false,
      ensureUserProfileReturnsVoid: false,
      catalogProbeError: "SUPABASE_SERVICE_ROLE_KEY not configured",
      postgrestCallable: false,
      postgrestHttpStatus: null,
      postgrestError: null,
      postgrestData: null,
      serviceRoleExecutable: false,
      serviceRoleError: "SUPABASE_SERVICE_ROLE_KEY not configured",
      serviceRoleResponsePreview: null,
      issue: classified.issue,
      diagnosis: classified.diagnosis,
      nextAction: classified.nextAction,
      userMessage: classified.userMessage,
      actionHint: classified.actionHint,
      lastError: "SUPABASE_SERVICE_ROLE_KEY not configured",
      hint: classified.userMessage,
      testPayload,
    };
  }

  const tablesDirect = await probeBillingTables(admin);
  const catalog = await probePostgresCatalog(admin);

  const tables: CreditBillingTablesState = {
    profiles: tablesDirect.profiles || Boolean(catalog.tablesFromDebug.profiles),
    credit_events: tablesDirect.credit_events || Boolean(catalog.tablesFromDebug.credit_events),
    token_ledger: tablesDirect.token_ledger || Boolean(catalog.tablesFromDebug.token_ledger),
    ai_usage_logs: tablesDirect.ai_usage_logs || Boolean(catalog.tablesFromDebug.ai_usage_logs),
  };

  const analysis = analyzeCatalog(catalog.chargeSignatures, catalog.ensureSignatures);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let postgrestCallable = false;
  let postgrestHttpStatus: number | null = null;
  let postgrestError: string | null = null;
  let postgrestData: unknown = null;

  if (url && key) {
    const rest = await probePostgrestRest(url, key, testPayload);
    postgrestCallable = rest.callable;
    postgrestHttpStatus = rest.httpStatus;
    postgrestError = rest.error;
    postgrestData = rest.data;
  } else {
    postgrestError = "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing";
  }

  const { data, error } = await admin.rpc("charge_tokens", testPayload as never);
  const serviceRoleExecutable = isExecutableResponse(error?.message, data);
  const serviceRoleError = error?.message ?? null;

  const classified = classifyIssue({
    tables,
    catalogReadable: catalog.catalogReadable,
    postgresExists: analysis.postgresExists,
    postgresDuplicateOverloads: analysis.postgresDuplicateOverloads,
    wrongPgSignature: analysis.wrongPgSignature,
    ensureUserProfileReturnsVoid: analysis.ensureUserProfileReturnsVoid,
    postgrestCallable,
    serviceRoleExecutable,
    postgrestError,
    serviceRoleError,
    catalogProbeError: catalog.catalogProbeError,
  });

  const lastError = serviceRoleError ?? postgrestError ?? catalog.catalogProbeError;

  return {
    ok: classified.ok,
    tables,
    postgresExists: analysis.postgresExists,
    postgresCatalogReadable: catalog.catalogReadable,
    postgresSignatures: catalog.chargeSignatures,
    postgresCanonical: analysis.postgresCanonical,
    postgresDuplicateOverloads: analysis.postgresDuplicateOverloads,
    ensureUserProfilePostgresExists: analysis.ensureUserProfilePostgresExists,
    ensureUserProfileSignatures: catalog.ensureSignatures,
    ensureUserProfileCanonical: analysis.ensureUserProfileCanonical,
    ensureUserProfileReturnsVoid: analysis.ensureUserProfileReturnsVoid,
    catalogProbeError: catalog.catalogProbeError,
    postgrestCallable,
    postgrestHttpStatus,
    postgrestError,
    postgrestData,
    serviceRoleExecutable,
    serviceRoleError,
    serviceRoleResponsePreview: data ?? null,
    issue: classified.issue,
    diagnosis: classified.diagnosis,
    nextAction: classified.nextAction,
    userMessage: classified.userMessage,
    actionHint: classified.actionHint,
    lastError,
    hint: classified.ok ? null : classified.userMessage,
    testPayload,
  };
}

export type ChargeTokensDebugReport = ChargeTokensProbeResult & {
  checkedAt: string;
  projectRef: string | null;
  supabaseUrlHost: string | null;
  appEnv: "local" | "production" | "unknown";
  serviceRolePresent: boolean;
};

/** Owner debug bundle — GET /api/admin/debug-credit-rpc */
export async function runChargeTokensDebugReport(
  ownerUserId?: string | null,
): Promise<ChargeTokensDebugReport> {
  const probe = await probeChargeTokensRpcDetailed();

  if (ownerUserId) {
    const admin = createServiceRoleClient();
    const payload = buildChargeTokensProbePayload({
      p_user_id: ownerUserId,
      p_idempotency_key: `owner_debug_${Date.now()}`,
    });
    if (admin) {
      const { data, error } = await admin.rpc("charge_tokens", payload as never);
      const executable = isExecutableResponse(error?.message, data);
      probe.testPayload = payload;
      probe.serviceRoleExecutable = executable;
      probe.serviceRoleError = error?.message ?? null;
      probe.serviceRoleResponsePreview = data ?? null;
      if (executable) {
        probe.postgrestCallable = true;
        const reclass = classifyIssue({
          tables: probe.tables,
          catalogReadable: probe.postgresCatalogReadable,
          postgresExists: probe.postgresExists,
          postgresDuplicateOverloads: probe.postgresDuplicateOverloads,
          wrongPgSignature: probe.postgresExists && !probe.postgresCanonical,
          ensureUserProfileReturnsVoid: probe.ensureUserProfileReturnsVoid,
          postgrestCallable: probe.postgrestCallable,
          serviceRoleExecutable: true,
          postgrestError: probe.postgrestError,
          serviceRoleError: null,
          catalogProbeError: probe.catalogProbeError,
        });
        probe.ok = reclass.ok;
        probe.issue = reclass.issue;
        probe.diagnosis = reclass.diagnosis;
        probe.nextAction = reclass.nextAction;
        probe.userMessage = reclass.userMessage;
        probe.actionHint = reclass.actionHint;
      }
    }
  }

  return {
    ...probe,
    checkedAt: new Date().toISOString(),
    projectRef: projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseUrlHost: supabaseUrlHost(process.env.NEXT_PUBLIC_SUPABASE_URL),
    appEnv: getSupabaseEnvSource(),
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export const CANONICAL_EXPECTED = {
  charge_tokensArgs: CANONICAL_CHARGE_TOKENS_PG_ARGS,
  ensure_user_profileArgs: CANONICAL_ENSURE_USER_PROFILE_PG_ARGS,
};
