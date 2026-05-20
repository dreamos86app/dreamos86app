import { NextResponse } from "next/server";
import { requireDreamosOwner } from "@/lib/admin/require-owner";
import { checkOnboardingSchemaHealth } from "@/lib/onboarding/schema-health";

/**
 * GET /api/admin/onboarding-schema-health
 * Lists missing onboarding/profile columns and tables before users hit them one-by-one.
 */
export async function GET() {
  const owner = await requireDreamosOwner();
  if (owner.error) {
    return owner.error;
  }

  try {
    const report = await checkOnboardingSchemaHealth();
    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "health_check_failed";
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: "Set SUPABASE_SERVICE_ROLE_KEY and apply complete onboarding migration.",
      },
      { status: 503 },
    );
  }
}
