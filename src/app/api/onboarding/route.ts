import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { completeOnboardingForUser } from "@/lib/onboarding/complete-onboarding";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isPostgrestSchemaOrMissingTableError } from "@/lib/supabase/schema-errors";

const bodySchema = z.object({
  hear_about: z.string().min(1).max(120),
  build_first: z.string().min(1).max(120),
  promo_code: z.string().max(16).optional(),
  replay: z.boolean().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", code: "invalid_body" }, { status: 400 });
  }

  const url = new URL(request.url);
  const replay =
    parsed.data.replay === true || url.searchParams.get("replay") === "1";

  const result = await completeOnboardingForUser(user, {
    hearAbout: parsed.data.hear_about,
    buildFirst: parsed.data.build_first,
    promoCode: parsed.data.promo_code,
    replay,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code ?? "onboarding_failed",
        hint: result.hint,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    success: true,
    already_completed: result.alreadyCompleted === true,
    referral_claim: result.referralClaim ?? null,
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const replay = new URL(request.url).searchParams.get("replay") === "1";
  if (replay) {
    return NextResponse.json({ completed: false, replay: true });
  }

  try {
    const admin = createSupabaseAdmin();
    const [{ data: profile, error: profileErr }, { data: onboarding, error: onboardingErr }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("onboarding_completed, onboarding_completed_at")
          .eq("id", user.id)
          .maybeSingle(),
        admin
          .from("onboarding")
          .select("completed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (profileErr && isPostgrestSchemaOrMissingTableError(profileErr.message)) {
      return NextResponse.json(
        {
          error: profileErr.message,
          code: "schema_error",
          hint: "Apply complete_onboarding_schema migration and NOTIFY pgrst.",
        },
        { status: 503 },
      );
    }

    if (onboardingErr && isPostgrestSchemaOrMissingTableError(onboardingErr.message)) {
      return NextResponse.json(
        {
          error: onboardingErr.message,
          code: "schema_error",
          hint: "public.onboarding table or columns missing — run complete onboarding migration.",
        },
        { status: 503 },
      );
    }

    const completed =
      profile?.onboarding_completed === true || Boolean(onboarding?.completed_at);

    return NextResponse.json({
      completed,
      completed_at:
        profile?.onboarding_completed_at ?? onboarding?.completed_at ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "service_unavailable";
    return NextResponse.json(
      { error: msg, code: "service_role_missing" },
      { status: 503 },
    );
  }
}
