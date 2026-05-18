import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveReferrerUserId } from "@/lib/referrals/server-referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/referrals/validate { code } — checks that a referral code exists (no mutation). */
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
    return NextResponse.json({ valid: false, error: "invalid_code" }, { status: 400 });
  }

  const referrerId = await resolveReferrerUserId(code);
  if (!referrerId) {
    return NextResponse.json({ valid: false, error: "code_not_found" });
  }
  if (referrerId === user.id) {
    return NextResponse.json({ valid: false, error: "self_referral" });
  }

  return NextResponse.json({ valid: true });
}
