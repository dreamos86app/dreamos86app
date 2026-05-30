import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type OnboardingSurveySegment = {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
};

export type OnboardingUserRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  hearAbout: string | null;
  buildGoal: string | null;
  promoCode: string | null;
  useCase: string | null;
  experienceLevel: string | null;
  completedAt: string | null;
  answers: Record<string, unknown>;
};

export type OnboardingInsightsPayload = {
  totalCompleted: number;
  hearAbout: OnboardingSurveySegment[];
  buildGoals: OnboardingSurveySegment[];
  experienceLevels: OnboardingSurveySegment[];
  users: OnboardingUserRow[];
  hasMore: boolean;
  offset: number;
  limit: number;
};

const CHART_COLORS = [
  "#1e6bff",
  "#7c3aed",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#0891b2",
  "#dc2626",
  "#6366f1",
];

function pickPromoCode(
  row: {
    promo_code?: string | null;
    answers?: unknown;
  },
  profile?: { onboarding_answers?: unknown; referred_by?: string | null; signup_referral_code?: string | null },
): string | null {
  const direct = row.promo_code?.trim();
  if (direct) return direct;

  for (const blob of [row.answers, profile?.onboarding_answers]) {
    if (blob && typeof blob === "object" && !Array.isArray(blob)) {
      const a = blob as Record<string, unknown>;
      const code =
        (typeof a.promo_code === "string" ? a.promo_code : null) ||
        (typeof a.promoCode === "string" ? a.promoCode : null) ||
        (typeof a.referral_code === "string" ? a.referral_code : null);
      if (code?.trim()) return code.trim();
    }
  }

  const signupRef = profile?.signup_referral_code?.trim();
  if (signupRef) return signupRef;
  if (profile?.referred_by) return `referred:${profile.referred_by.slice(0, 8)}…`;
  return null;
}

function pickHearAbout(
  row: { referral_source?: string | null; answers?: unknown },
  profileAnswers?: unknown,
): string | null {
  const direct = row.referral_source?.trim();
  if (direct) return direct;

  for (const blob of [row.answers, profileAnswers]) {
    if (blob && typeof blob === "object" && !Array.isArray(blob)) {
      const a = blob as Record<string, unknown>;
      const fromAnswers =
        (typeof a.hear_about === "string" ? a.hear_about : null) ||
        (typeof a.heard_about_us === "string" ? a.heard_about_us : null) ||
        (typeof a.referral_source === "string" ? a.referral_source : null);
      if (fromAnswers?.trim()) return fromAnswers.trim();
    }
  }
  return null;
}

function aggregateCounts(
  rows: Array<{ label: string }>,
): OnboardingSurveySegment[] {
  const map = new Map<string, number>();
  for (const { label } of rows) {
    const key = label.trim() || "Not specified";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({
      key: label.toLowerCase().replace(/\s+/g, "_").slice(0, 48),
      label,
      count,
      percent: Math.round((count / total) * 1000) / 10,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
}

export async function loadOnboardingInsights(options: {
  limit?: number;
  offset?: number;
}): Promise<OnboardingInsightsPayload> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const admin = createSupabaseAdmin();

  const [{ data: onboardingRows, error: onboardingErr }, { count: totalCount }, { data: chartRows }] =
    await Promise.all([
      admin
        .from("onboarding")
        .select(
          "user_id, completed_at, referral_source, use_case, experience_level, answers, workspace_name",
        )
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .range(offset, offset + limit - 1),
      admin
        .from("onboarding")
        .select("user_id", { count: "exact", head: true })
        .not("completed_at", "is", null),
      admin
        .from("onboarding")
        .select("referral_source, use_case, experience_level, answers")
        .not("completed_at", "is", null)
        .limit(2000),
    ]);

  if (onboardingErr) {
    throw new Error(onboardingErr.message);
  }

  const completed = onboardingRows ?? [];
  const userIds = completed.map((r) => r.user_id as string).filter(Boolean);

  const profilesById = new Map<
    string,
    {
      email: string | null;
      display_name: string | null;
      onboarding_answers: unknown;
      referred_by: string | null;
      signup_referral_code: string | null;
    }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select(
        "id, email, display_name, full_name, onboarding_answers, use_case, experience_level, referred_by, signup_referral_code",
      )
      .in("id", userIds);

    for (const p of profiles ?? []) {
      profilesById.set(p.id as string, {
        email: (p.email as string | null) ?? null,
        display_name:
          (p.display_name as string | null) ??
          (p.full_name as string | null) ??
          null,
        onboarding_answers: p.onboarding_answers,
        referred_by: (p.referred_by as string | null) ?? null,
        signup_referral_code: (p.signup_referral_code as string | null) ?? null,
      });
    }
  }

  const hearRows: Array<{ label: string }> = [];
  const buildRows: Array<{ label: string }> = [];
  const expRows: Array<{ label: string }> = [];

  for (const row of chartRows ?? []) {
    const hearAbout = pickHearAbout(row, null);
    const buildGoal = row.use_case?.trim() || "Not specified";
    const exp = row.experience_level?.trim() ?? "Not specified";
    hearRows.push({ label: hearAbout ?? "Not specified" });
    buildRows.push({ label: buildGoal });
    expRows.push({ label: exp });
  }

  const pageUsers: OnboardingUserRow[] = completed.map((row) => {
    const userId = row.user_id;
    const profile = profilesById.get(userId);
    const hearAbout = pickHearAbout(row, profile?.onboarding_answers);
    const answersBlob =
      row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
        ? (row.answers as Record<string, unknown>)
        : {};
    const buildGoal =
      (typeof answersBlob.build_first === "string" ? answersBlob.build_first : null)?.trim() ||
      row.use_case?.trim() ||
      row.workspace_name?.trim() ||
      null;
    const exp = row.experience_level?.trim() ?? null;
    const promoCode = pickPromoCode(row, profile);
    const answers =
      row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
        ? (row.answers as Record<string, unknown>)
        : profile?.onboarding_answers &&
            typeof profile.onboarding_answers === "object" &&
            !Array.isArray(profile.onboarding_answers)
          ? (profile.onboarding_answers as Record<string, unknown>)
          : {};

    return {
      userId,
      email: profile?.email ?? null,
      displayName: profile?.display_name ?? null,
      hearAbout,
      buildGoal,
      promoCode,
      useCase: row.use_case?.trim() ?? null,
      experienceLevel: exp,
      completedAt: row.completed_at ?? null,
      answers,
    };
  });

  const totalCompleted = totalCount ?? pageUsers.length;

  return {
    totalCompleted,
    hearAbout: aggregateCounts(hearRows),
    buildGoals: aggregateCounts(buildRows),
    experienceLevels: aggregateCounts(expRows),
    users: pageUsers,
    hasMore: offset + limit < totalCompleted,
    offset,
    limit,
  };
}
