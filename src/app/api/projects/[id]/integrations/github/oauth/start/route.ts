import { NextResponse } from "next/server";
import { verifyProjectOwner } from "@/lib/integrations/server/verify-project";
import { githubOAuthConfigured } from "@/lib/integrations/server/github-api";
import { getAppUrl } from "@/lib/app-url";
import { createHmac, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function signState(payload: string): string {
  const secret = process.env.GITHUB_OAUTH_STATE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
}

/** GET — redirect to GitHub OAuth (one-click connect). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  if (!githubOAuthConfigured()) {
    return NextResponse.json(
      {
        error: "GitHub OAuth is not configured",
        hint: "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the server.",
      },
      { status: 503 },
    );
  }

  const clientId = process.env.GITHUB_CLIENT_ID!.trim();
  const nonce = randomBytes(8).toString("hex");
  const raw = `${projectId}:${verified.data.ownerId}:${nonce}`;
  const state = `${Buffer.from(raw).toString("base64url")}.${signState(raw)}`;

  const redirectUri = `${getAppUrl().replace(/\/$/, "")}/api/integrations/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "repo,read:user");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
