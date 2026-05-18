import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachReferralByCode } from "@/lib/referrals/server-referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/referrals/attribute
 * Body: { code: string }
 *
 * Records a pending referral (both users earn credits after onboarding via claim_referral_reward).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const result = await attachReferralByCode(user.id, code);
  if (!result.ok) {
    const status =
      result.error === "code_not_found"
        ? 404
        : result.error === "self_referral" || result.error === "referral_limit_reached"
          ? 400
          : result.error === "no_profile"
            ? 409
            : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ attributed: true });
}
