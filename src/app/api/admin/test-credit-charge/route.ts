import { NextResponse } from "next/server";
import { requireDreamosOwner } from "@/lib/admin/require-owner";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { chargeAiOperation } from "@/lib/credits/charge-ai-operation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireDreamosOwner();
  if (gate.error) return gate.error;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  let amount = 1;
  try {
    const body = (await request.json()) as { amount?: number };
    if (typeof body.amount === "number" && body.amount >= 1 && body.amount <= 5) {
      amount = Math.floor(body.amount);
    }
  } catch {
    /* default */
  }

  const userId = gate.user.id;
  const email = gate.user.email;

  const { data: beforeProfile } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .maybeSingle();

  const before = beforeProfile?.credits_remaining ?? null;
  const operationId = `test:${userId}:${Date.now()}`;

  const charge = await chargeAiOperation(admin, {
    userId,
    userEmail: email,
    amount,
    modelId: "test",
    mode: "test",
    operationId,
    routeReason: "owner_test_charge",
  });

  const { data: afterProfile } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({
    operation_id: operationId,
    amount,
    before_balance: before,
    after_balance: afterProfile?.credits_remaining ?? charge.remaining,
    charged: charge.charged,
    idempotent: charge.idempotent ?? false,
    error: charge.error ?? null,
  });
}
