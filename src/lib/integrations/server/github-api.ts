export type GitHubRepoRef = { owner: string; repo: string };

export function parseGitHubRepo(input: string): GitHubRepoRef | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    if (raw.includes("github.com")) {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) return { owner: parts[0]!, repo: parts[1]!.replace(/\.git$/, "") };
    }
  } catch {
    /* fall through */
  }
  const slash = raw.split("/").filter(Boolean);
  if (slash.length >= 2) return { owner: slash[0]!, repo: slash[1]!.replace(/\.git$/, "") };
  return null;
}

export async function testGitHubConnection(
  token: string,
  repo?: GitHubRepoRef | null,
): Promise<{ ok: true; login: string; repoFullName?: string } | { ok: false; error: string }> {
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) {
    return { ok: false, error: `GitHub auth failed (${userRes.status})` };
  }
  const user = (await userRes.json()) as { login?: string };
  if (!repo) {
    return { ok: true, login: user.login ?? "unknown" };
  }
  const repoRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, { headers });
  if (!repoRes.ok) {
    return { ok: false, error: `Repository ${repo.owner}/${repo.repo} not found or no access (${repoRes.status})` };
  }
  const repoBody = (await repoRes.json()) as { full_name?: string };
  return {
    ok: true,
    login: user.login ?? "unknown",
    repoFullName: repoBody.full_name ?? `${repo.owner}/${repo.repo}`,
  };
}

export function githubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim());
}
