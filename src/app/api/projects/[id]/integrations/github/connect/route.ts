import { NextResponse } from "next/server";
import { verifyProjectOwner } from "@/lib/integrations/server/verify-project";
import {
  saveProjectSecret,
  upsertProjectIntegration,
  writeConnectionAudit,
} from "@/lib/integrations/server/integration-store";
import { githubOAuthConfigured, parseGitHubRepo, testGitHubConnection } from "@/lib/integrations/server/github-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  let body: { token?: string; repo?: string };
  try {
    body = (await req.json()) as { token?: string; repo?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      {
        error: "GitHub token required",
        hint: githubOAuthConfigured()
          ? "OAuth can be added later; use a personal access token for now."
          : "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET for OAuth, or use a manual token.",
        oauthConfigured: githubOAuthConfigured(),
      },
      { status: 400 },
    );
  }

  const repoRef = body.repo ? parseGitHubRepo(body.repo) : null;
  if (body.repo?.trim() && !repoRef) {
    return NextResponse.json({ error: "Invalid repository (use owner/name or GitHub URL)" }, { status: 400 });
  }

  const test = await testGitHubConnection(token, repoRef);
  if (!test.ok) {
    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      action: "connect",
      status: "error",
      message: test.error,
    });
    return NextResponse.json({ error: test.error }, { status: 400 });
  }

  try {
    await saveProjectSecret({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      keyName: "GITHUB_TOKEN",
      value: token,
    });

    const displayName = test.repoFullName ?? `@${test.login}`;
    const now = new Date().toISOString();

    await upsertProjectIntegration({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      status: "connected",
      displayName,
      metadata: {
        login: test.login,
        repo: test.repoFullName ?? null,
      },
      lastTestedAt: now,
    });

    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "github",
      action: "connect",
      status: "ok",
      message: `Connected as ${test.login}`,
    });

    return NextResponse.json({
      ok: true,
      displayName,
      lastTestedAt: now,
      oauthConfigured: githubOAuthConfigured(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save connection";
    const hint = msg.includes("DREAMOS_SECRETS_MASTER_KEY")
      ? "Set DREAMOS_SECRETS_MASTER_KEY (64 hex chars) on the server."
      : undefined;
    return NextResponse.json({ error: msg, hint }, { status: 503 });
  }
}
