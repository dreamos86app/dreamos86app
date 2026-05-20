import { NextResponse } from "next/server";
import { verifyProjectOwner } from "@/lib/integrations/server/verify-project";
import { listProjectIntegrations } from "@/lib/integrations/server/integration-store";
import { githubOAuthConfigured } from "@/lib/integrations/server/github-api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  try {
    const integrations = await listProjectIntegrations(projectId);
    return NextResponse.json({
      integrations,
      githubOAuthConfigured: githubOAuthConfigured(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load integrations";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
