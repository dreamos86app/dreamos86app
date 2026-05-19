import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { monthlyTokensForPlan, normalizePlanId } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/supabase/types";

export type AdminUserListRow = {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan_id: PlanId;
  subscription_status: string | null;
  tokens_remaining: number;
  monthly_token_limit: number;
  created_at: string;
  last_active_at: string | null;
  suspended_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  projects_count: number;
  conversations_count: number;
  build_jobs_count: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  pending_downgrade_plan: PlanId | null;
};

/** Loose profile row — only fields we read (select * safe after migration). */
type ProfileRow = Record<string, unknown> & {
  id?: string;
  email?: string;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  plan_id?: string;
  credits_remaining?: number | null;
  monthly_token_limit?: number | null;
  created_at?: string;
  last_active_at?: string | null;
  suspended_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureProfileForAuthUser(
  admin: ReturnType<typeof createSupabaseAdmin>,
  authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
): Promise<void> {
  const email = (authUser.email ?? "").trim();
  if (!email) return;

  const { data: existing } = await admin.from("profiles").select("id").eq("id", authUser.id).maybeSingle();
  if (existing) return;

  const meta = authUser.user_metadata ?? {};
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null;

  // Minimal insert — only columns guaranteed after base migration shell
  const { error } = await admin.from("profiles").insert({
    id: authUser.id,
    email,
    full_name: fullName,
    display_name: fullName,
    credits_remaining: 100,
    plan_id: "free",
  } as never);

  if (error && !error.message.includes("duplicate")) {
    console.warn("[admin/list-users] profile insert:", error.message);
  }
}

async function loadProfiles(
  admin: ReturnType<typeof createSupabaseAdmin>,
  ids: string[],
): Promise<{ rows: ProfileRow[]; error?: string }> {
  if (ids.length === 0) return { rows: [] };

  const { data, error } = await admin.from("profiles").select("*").in("id", ids);

  if (!error) {
    return { rows: (data ?? []) as ProfileRow[] };
  }

  // Last resort: id + email only (broken schema)
  const { data: minimal, error: minErr } = await admin
    .from("profiles")
    .select("id,email,created_at")
    .in("id", ids);

  if (minErr) {
    return { rows: [], error: minErr.message };
  }

  return {
    rows: (minimal ?? []) as ProfileRow[],
    error: error.message,
  };
}

export async function listAdminUsers(options: {
  q?: string;
  plan?: string;
  status?: string;
  limit?: number;
}): Promise<{ users: AdminUserListRow[]; error?: string; warning?: string }> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(options.limit ?? 500, 500);
  const q = options.q?.trim().toLowerCase();

  const authUsers: Array<{
    id: string;
    email?: string;
    created_at?: string;
    last_sign_in_at?: string;
    user_metadata?: Record<string, unknown>;
  }> = [];

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { users: [], error: error.message };
    }
    const batch = data.users ?? [];
    authUsers.push(...batch);
    if (batch.length < perPage || authUsers.length >= limit) break;
    page += 1;
  }

  for (const u of authUsers.slice(0, limit)) {
    await ensureProfileForAuthUser(admin, u);
  }

  const ids = authUsers.slice(0, limit).map((u) => u.id);
  if (ids.length === 0) {
    return { users: [] };
  }

  const { rows: profiles, error: profileError } = await loadProfiles(admin, ids);
  const profileMap = new Map(profiles.map((p) => [String(p.id), p]));

  let subs: Array<{
    user_id: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    pending_downgrade_plan: string | null;
  }> = [];

  const subsRes = await admin
    .from("subscriptions")
    .select("user_id,status,current_period_end,cancel_at_period_end,pending_downgrade_plan")
    .in("user_id", ids);

  if (!subsRes.error) {
    subs = (subsRes.data ?? []) as typeof subs;
  }

  const subByUser = new Map(subs.map((s) => [s.user_id, s]));

  const [projectsRes, convRes, jobsRes] = await Promise.all([
    admin.from("projects").select("owner_id").in("owner_id", ids),
    admin.from("conversations").select("user_id").in("user_id", ids),
    admin.from("build_jobs").select("user_id").in("user_id", ids),
  ]);

  const countBy = (rows: Array<{ owner_id?: string; user_id?: string }> | null, key: "owner_id" | "user_id") => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const id = r[key];
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };

  const projectCounts = countBy(
    projectsRes.error ? [] : (projectsRes.data as Array<{ owner_id: string }>),
    "owner_id",
  );
  const convCounts = countBy(
    convRes.error ? [] : (convRes.data as Array<{ user_id: string }>),
    "user_id",
  );
  const jobCounts = countBy(
    jobsRes.error ? [] : (jobsRes.data as Array<{ user_id: string }>),
    "user_id",
  );

  const rows: AdminUserListRow[] = [];

  for (const au of authUsers.slice(0, limit)) {
    const p = profileMap.get(au.id);
    const email = (str(p?.email) || au.email || "").trim();
    if (!email) continue;

    const planId = normalizePlanId(str(p?.plan_id) ?? "free");
    const sub = subByUser.get(au.id);
    const monthlyLimit = num(p?.monthly_token_limit, monthlyTokensForPlan(planId));

    rows.push({
      id: au.id,
      email,
      full_name: str(p?.full_name),
      display_name: str(p?.display_name),
      avatar_url: str(p?.avatar_url),
      plan_id: planId,
      subscription_status:
        sub?.status ?? (str(p?.subscription_status) ?? (p?.stripe_subscription_id ? "active" : null)),
      tokens_remaining: num(p?.credits_remaining, 0),
      monthly_token_limit: monthlyLimit,
      created_at: str(p?.created_at) ?? au.created_at ?? new Date().toISOString(),
      last_active_at: str(p?.last_active_at) ?? au.last_sign_in_at ?? null,
      suspended_at: str(p?.suspended_at),
      stripe_customer_id: str(p?.stripe_customer_id),
      stripe_subscription_id: str(p?.stripe_subscription_id),
      projects_count: projectCounts.get(au.id) ?? 0,
      conversations_count: convCounts.get(au.id) ?? 0,
      build_jobs_count: jobCounts.get(au.id) ?? 0,
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      current_period_end: sub?.current_period_end ?? null,
      pending_downgrade_plan: sub?.pending_downgrade_plan
        ? normalizePlanId(sub.pending_downgrade_plan)
        : null,
    });
  }

  let filtered = rows;

  if (q) {
    filtered = filtered.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name?.toLowerCase().includes(q) ?? false) ||
        (u.display_name?.toLowerCase().includes(q) ?? false) ||
        u.id.toLowerCase().includes(q),
    );
  }

  if (options.plan && options.plan !== "all") {
    filtered = filtered.filter((u) => u.plan_id === normalizePlanId(options.plan!));
  }

  if (options.status === "suspended") {
    filtered = filtered.filter((u) => u.suspended_at != null);
  } else if (options.status === "active") {
    filtered = filtered.filter((u) => u.suspended_at == null);
  }

  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    users: filtered,
    error: profileError && filtered.length === 0 ? profileError : undefined,
    warning:
      profileError && filtered.length > 0
        ? `Partial profile data: ${profileError}. Run migration 20260525120000_profiles_production_complete.sql on Supabase.`
        : undefined,
  };
}
