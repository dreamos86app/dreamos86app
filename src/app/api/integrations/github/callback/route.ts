import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import {
  saveProjectSecret,
  upsertProjectIntegration,
  writeConnectionAudit,
} from "@/lib/integrations/server/integration-store";
import { testGitHubConnection } from "@/lib/integrations/server/github-api";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

function signState(payload: string): string {
  const secret = process.env.GITHUB_OAUTH_STATE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = getAppUrl().replace(/\/$/, "");

  if (!code || !state) {
    return NextResponse.redirect(`${base}/create?github=error&reason=missing_code`);
  }

  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) {
    return NextResponse.redirect(`${base}/create?github=error&reason=bad_state`);
  }

  let raw: string;
  try {
    raw = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return NextResponse.redirect(`${base}/create?github=error&reason=bad_state`);
  }

  if (signState(raw) !== sig) {
    return NextResponse.redirect(`${base}/create?github=error&reason=invalid_state`);
  }

  const [projectId, ownerId] = raw.split(":");
  if (!projectId || !ownerId) {
    return NextResponse.redirect(`${base}/create?github=error&reason=invalid_state`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${base}/create?github=error&reason=oauth_not_configured`);
  }

  const redirectUri = `${base}/api/integrations/github/callback`;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.redirect(
      `${base}/create?projectId=${projectId}&github=error&reason=${encodeURIComponent(tokenJson.error ?? "token_exchange_failed")}`,
    );
  }

  const test = await testGitHubConnection(tokenJson.access_token);
  if (!test.ok) {
    return NextResponse.redirect(
      `${base}/create?projectId=${projectId}&github=error&reason=${encodeURIComponent(test.error)}`,
    );
  }

  try {
    await saveProjectSecret({
      projectId,
      ownerId,
      provider: "github",
      keyName: "GITHUB_TOKEN",
      value: tokenJson.access_token,
    });

    const now = new Date().toISOString();
    await upsertProjectIntegration({
      projectId,
      ownerId,
      provider: "github",
      status: "connected",
      displayName: `@${test.login}`,
      metadata: { login: test.login, oauth: true },
      lastTestedAt: now,
    });

    await writeConnectionAudit({
      projectId,
      ownerId,
      provider: "github",
      action: "connect",
      status: "ok",
      message: `OAuth connected as ${test.login}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    return NextResponse.redirect(
      `${base}/create?projectId=${projectId}&github=error&reason=${encodeURIComponent(msg)}`,
    );
  }

  return NextResponse.redirect(`${base}/create?projectId=${projectId}&github=connected`);
}
