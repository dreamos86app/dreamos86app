import { NextResponse } from "next/server";
import { requireDreamosOwner } from "@/lib/admin/require-owner";
import { checkBuilderSchemaHealth } from "@/lib/builder/schema-health";

/** GET /api/admin/builder-schema-health — builder tables, columns, RPCs */
export async function GET() {
  const owner = await requireDreamosOwner();
  if (owner.error) return owner.error;

  try {
    const report = await checkBuilderSchemaHealth();
    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "health_check_failed";
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        migration_file: "supabase/migrations/20260528120000_builder_runtime_quality_and_credits.sql",
        fallback_script: "scripts/builder-runtime-quality-and-credits.sql",
      },
      { status: 503 },
    );
  }
}
