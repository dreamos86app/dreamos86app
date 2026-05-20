import { NextResponse } from "next/server";
import { verifyProjectOwner } from "@/lib/integrations/server/verify-project";
import {
  deleteProviderSecrets,
  upsertProjectIntegration,
  writeConnectionAudit,
} from "@/lib/integrations/server/integration-store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  try {
    await deleteProviderSecrets({ projectId, provider: "github" });
    await upsertProjectIntegration({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      status: "disconnected",
      displayName: null,
      metadata: {},
    });
    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      action: "disconnect",
      status: "ok",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Disconnect failed" },
      { status: 500 },
    );
  }
}
