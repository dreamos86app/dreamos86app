"use client";

import * as React from "react";
import { Loader2, Plug, CheckCircle2, AlertCircle, GitBranch } from "lucide-react";
import { IntegrationIconWell } from "@/components/brand/integration-icons";
import { toast } from "@/lib/toast";

type IntegrationRow = {
  provider: string;
  status: string;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  last_tested_at: string | null;
  updated_at: string | null;
};

const PROVIDERS = [
  {
    id: "github",
    label: "GitHub",
    description: "Sync repos and deployment metadata for this app only.",
    envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"],
  },
  {
    id: "supabase",
    label: "Supabase",
    description: "Your generated app’s Supabase project (not DreamOS86 platform DB).",
    envVars: [] as string[],
  },
  {
    id: "stripe",
    label: "Stripe",
    description: "Payments for this app.",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
  {
    id: "vercel",
    label: "Vercel / Publish",
    description: "Deploy and host this app.",
    envVars: ["VERCEL_TOKEN"],
  },
  {
    id: "resend",
    label: "Resend",
    description: "Transactional email.",
    envVars: ["RESEND_API_KEY"],
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Model API for generated backend.",
    envVars: ["OPENAI_API_KEY"],
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Google AI for this app.",
    envVars: ["GOOGLE_GENERATIVE_AI_API_KEY"],
  },
  {
    id: "r2",
    label: "Cloudflare R2",
    description: "Object storage.",
    envVars: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
  },
  {
    id: "slack",
    label: "Slack",
    description: "Notifications and bots.",
    envVars: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  },
] as const;

function statusBadge(status: string) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3" /> Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
        <AlertCircle className="size-3" /> Error
      </span>
    );
  }
  if (status === "needs_config") {
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
        Needs config
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      Disconnected
    </span>
  );
}

function GitHubConnectForm({
  projectId,
  oauthConfigured,
  onDone,
}: {
  projectId: string;
  oauthConfigured: boolean;
  onDone: () => void;
}) {
  const [token, setToken] = React.useState("");
  const [repo, setRepo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function connect() {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/integrations/github/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, repo: repo || undefined }),
      });
      const j = (await r.json()) as { error?: string; hint?: string; displayName?: string };
      if (!r.ok) {
        toast.error(j.hint ? `${j.error} — ${j.hint}` : (j.error ?? "Connect failed"));
        return;
      }
      toast.success(`GitHub connected: ${j.displayName ?? "OK"}`);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  function startOAuth() {
    window.location.href = `/api/projects/${projectId}/integrations/github/oauth/start`;
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface/50 p-3">
      {oauthConfigured ? (
        <button
          type="button"
          disabled={busy}
          onClick={startOAuth}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#24292f] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <GitBranch className="size-4" strokeWidth={1.75} />
          Connect with GitHub in one click
        </button>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          GitHub OAuth not configured on the server. Use a manual token below or add{" "}
          <span className="font-mono text-[10px]">GITHUB_CLIENT_ID</span> /{" "}
          <span className="font-mono text-[10px]">GITHUB_CLIENT_SECRET</span>.
        </p>
      )}
      <label className="block text-[11px] font-medium text-foreground">
        Personal access token
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_…"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]"
        />
      </label>
      <label className="block text-[11px] font-medium text-foreground">
        Repository (optional)
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo or GitHub URL"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]"
        />
      </label>
      <button
        type="button"
        disabled={busy || !token.trim()}
        onClick={() => void connect()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-2 text-[12px] font-semibold text-background disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranch className="size-3.5" />}
        Connect GitHub to this app
      </button>
    </div>
  );
}

function SupabaseConnectForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [anonKey, setAnonKey] = React.useState("");
  const [serviceKey, setServiceKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function connect() {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/integrations/supabase/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          anonKey,
          serviceRoleKey: serviceKey || undefined,
        }),
      });
      const j = (await r.json()) as { error?: string; hint?: string };
      if (!r.ok) {
        toast.error(j.hint ? `${j.error} — ${j.hint}` : (j.error ?? "Connect failed"));
        return;
      }
      toast.success("Supabase connected for this app");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface/50 p-3">
      <p className="text-[11px] text-muted-foreground">
        This is your <strong>app&apos;s</strong> Supabase — separate from DreamOS86 platform auth.
        Find values in Supabase → Project Settings → API.
      </p>
      <label className="block text-[11px] font-medium">
        Project URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.supabase.co"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]"
        />
      </label>
      <label className="block text-[11px] font-medium">
        Anon / public key
        <input
          type="password"
          value={anonKey}
          onChange={(e) => setAnonKey(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]"
        />
      </label>
      <label className="block text-[11px] font-medium">
        Service role key (optional, server-only)
        <input
          type="password"
          value={serviceKey}
          onChange={(e) => setServiceKey(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[12px]"
        />
      </label>
      <button
        type="button"
        disabled={busy || !url.trim() || !anonKey.trim()}
        onClick={() => void connect()}
        className="w-full rounded-lg bg-accent py-2 text-[12px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Connect Supabase to this app"}
      </button>
      <p className="text-[10px] text-muted-foreground">
        DreamOS managed Supabase: not available yet — connect your own project.
      </p>
    </div>
  );
}

export function ProjectIntegrationsPanel({ projectId }: { projectId: string }) {
  const [rows, setRows] = React.useState<IntegrationRow[]>([]);
  const [githubOAuth, setGithubOAuth] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/integrations`);
      const j = (await r.json()) as {
        integrations?: IntegrationRow[];
        githubOAuthConfigured?: boolean;
        error?: string;
      };
      if (!r.ok) {
        toast.error(j.error ?? "Could not load integrations");
        return;
      }
      setRows(j.integrations ?? []);
      setGithubOAuth(Boolean(j.githubOAuthConfigured));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function rowFor(id: string) {
    return rows.find((x) => x.provider === id);
  }

  async function testProvider(provider: "github" | "supabase") {
    setActionBusy(`test-${provider}`);
    try {
      const r = await fetch(`/api/projects/${projectId}/integrations/${provider}/test`, {
        method: "POST",
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "Test failed");
        return;
      }
      toast.success("Connection OK");
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  async function disconnectProvider(provider: "github" | "supabase") {
    setActionBusy(`disconnect-${provider}`);
    try {
      const r = await fetch(`/api/projects/${projectId}/integrations/${provider}/disconnect`, {
        method: "POST",
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "Disconnect failed");
        return;
      }
      toast.success("Disconnected");
      setExpanded(null);
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-[13px]">Loading integrations…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Plug className="size-4 text-accent" />
        <p className="text-[13px] font-semibold text-foreground">App integrations</p>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Connections apply to this app only. Secrets are stored encrypted server-side (requires{" "}
        <code className="rounded bg-muted px-1 text-[10px]">DREAMOS_SECRETS_MASTER_KEY</code>).
      </p>

      {PROVIDERS.map((p) => {
        const row = rowFor(p.id);
        const status = row?.status ?? "disconnected";
        const wired = p.id === "github" || p.id === "supabase";
        const isOpen = expanded === p.id;

        return (
          <div key={p.id} className="rounded-xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <IntegrationIconWell provider={p.id} size="sm" title={p.label} />
                <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{p.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</p>
                {row?.display_name && (
                  <p className="mt-1 text-[11px] font-medium text-foreground">{row.display_name}</p>
                )}
                {row?.last_tested_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Last tested {new Date(row.last_tested_at).toLocaleString()}
                  </p>
                )}
                </div>
              </div>
              {statusBadge(status)}
            </div>

            {!wired && p.envVars.length > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Server env:{" "}
                {p.envVars.map((v) => (
                  <code key={v} className="mr-1 rounded bg-muted px-1 py-0.5 font-mono text-[9px]">
                    {v}
                  </code>
                ))}
              </p>
            )}
            {!wired && (
              <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">
                Connect flow coming soon — use Secrets in the builder for now.
              </p>
            )}

            {wired && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="rounded-lg bg-surface px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-border hover:bg-surface-raised"
                >
                  {status === "connected" ? "Manage" : "Connect"}
                </button>
                {status === "connected" && (
                  <>
                    <button
                      type="button"
                      disabled={!!actionBusy}
                      onClick={() => void testProvider(p.id as "github" | "supabase")}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-accent ring-1 ring-accent/30 hover:bg-accent/5 disabled:opacity-50"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      disabled={!!actionBusy}
                      onClick={() => void disconnectProvider(p.id as "github" | "supabase")}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-destructive ring-1 ring-destructive/30 hover:bg-destructive/5 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            )}

            {isOpen && wired && p.id === "github" && (
              <GitHubConnectForm
                projectId={projectId}
                oauthConfigured={githubOAuth}
                onDone={() => void load()}
              />
            )}
            {isOpen && wired && p.id === "supabase" && (
              <SupabaseConnectForm projectId={projectId} onDone={() => void load()} />
            )}
          </div>
        );
      })}
    </div>
  );
}
