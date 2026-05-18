import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { z } from "zod";
import { attachReferralByCode } from "@/lib/referrals/server-referral";

const bodySchema = z.object({
  hear_about: z.string().min(1).max(120),
  build_first: z.string().min(1).max(120),
  promo_code: z.string().max(16).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { hear_about, build_first, promo_code } = parsed.data;
  const now = new Date().toISOString();

  const code = promo_code?.trim().toUpperCase() ?? "";
  if (code) {
    const applied = await attachReferralByCode(user.id, code);
    if (!applied.ok && applied.error !== "insert_failed") {
      const status =
        applied.error === "code_not_found"
          ? 404
          : applied.error === "self_referral" || applied.error === "referral_limit_reached"
            ? 400
            : 400;
      return NextResponse.json({ error: applied.error }, { status });
    }
  }

  const onboarding_answers = {
    hear_about,
    build_first,
    promo_code: code || null,
    completed_at: now,
  };

  await supabase.from("onboarding").upsert({
    user_id: user.id,
    completed_at: now,
    workspace_name: null,
    experience_level: null,
    preferred_model: null,
    referral_source: hear_about,
    use_case: build_first,
    answers: onboarding_answers as Json,
  });

  await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      onboarding_completed_at: now,
      onboarding_answers,
      use_case: build_first,
    })
    .eq("id", user.id);

  await supabase.rpc("claim_referral_reward", {
    p_referred_id: user.id,
    p_credits: 20,
  });

  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    completed: profile?.onboarding_completed ?? false,
    completed_at: profile?.onboarding_completed_at,
  });
}
