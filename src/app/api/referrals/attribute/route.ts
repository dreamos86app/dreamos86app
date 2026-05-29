import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyReferralForNewUser } from "@/lib/referrals/apply-referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/referrals/attribute
 * Body: { code: string }
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

  const result = await applyReferralForNewUser({
    newUserId: user.id,
    referralCode: code,
    source: "attribute_api",
    operationId: `attribute_api:${user.id}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  if (!result.applied) {
    const status =
      result.reason === "code_not_found"
        ? 404
        : result.reason === "existing_user" || result.reason === "already_referred"
          ? 400
          : result.reason === "self_referral" || result.reason === "referral_limit_reached"
            ? 400
            : 400;
    return NextResponse.json(
      { error: result.reason ?? "not_applied", attributed: false },
      { status },
    );
  }

  return NextResponse.json({
    attributed: true,
    referralId: result.referralId,
    rewards: result.rewards,
  });
}
