import { NextResponse } from "next/server";
import { verifyProjectOwner, getIntegrationAdmin } from "@/lib/integrations/server/verify-project";
import {
  upsertProjectIntegration,
  writeConnectionAudit,
} from "@/lib/integrations/server/integration-store";
import { parseGitHubRepo, testGitHubConnection } from "@/lib/integrations/server/github-api";
import { unsealSecret } from "@/lib/secrets/seal";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  let admin;
  try {
    admin = getIntegrationAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server misconfiguration" },
      { status: 503 },
    );
  }

  const { data: secretRow } = await admin
    .from("project_secrets")
    .select("ciphertext")
    .eq("project_id", projectId)
    .eq("key_name", "GITHUB_TOKEN")
    .maybeSingle();

  if (!secretRow?.ciphertext) {
    return NextResponse.json({ error: "GitHub is not connected for this app" }, { status: 400 });
  }

  const { data: integ } = await admin
    .from("project_integrations")
    .select("metadata")
    .eq("project_id", projectId)
    .eq("provider", "github")
    .maybeSingle();

  const meta = (integ?.metadata ?? {}) as Record<string, unknown>;
  const repoStr = typeof meta.repo === "string" ? meta.repo : null;
  const repoRef = repoStr ? parseGitHubRepo(repoStr) : null;

  let token: string;
  try {
    token = unsealSecret(secretRow.ciphertext as string);
  } catch {
    return NextResponse.json(
      { error: "Could not read stored token", hint: "Check DREAMOS_SECRETS_MASTER_KEY on server." },
      { status: 503 },
    );
  }

  const test = await testGitHubConnection(token, repoRef);
  const now = new Date().toISOString();

  if (!test.ok) {
    await upsertProjectIntegration({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      status: "error",
      displayName: typeof meta.login === "string" ? `@${meta.login}` : "GitHub",
      metadata: meta,
      lastTestedAt: now,
    });
    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      action: "test",
      status: "error",
      message: test.error,
    });
    return NextResponse.json({ error: test.error }, { status: 400 });
  }

  await upsertProjectIntegration({
    projectId,
    ownerId: verified.data.ownerId,
    provider: "github",
    status: "connected",
    displayName: test.repoFullName ?? `@${test.login}`,
    metadata: { login: test.login, repo: test.repoFullName ?? repoStr },
    lastTestedAt: now,
  });
  await writeConnectionAudit({
    projectId,
    ownerId: verified.data.ownerId,
    provider: "github",
    action: "test",
    status: "ok",
    message: "Connection OK",
  });

  return NextResponse.json({ ok: true, lastTestedAt: now, displayName: test.repoFullName ?? `@${test.login}` });
}
