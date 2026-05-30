"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Rocket,
  Globe,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader,
  RefreshCw,
  ExternalLink,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PublicUrlModeBadge } from "@/components/publish/public-url-mode-badge";

type DeploymentRow = {
  id: string;
  project_id: string;
  provider: string;
  status: string;
  deployment_url: string | null;
  provider_deployment_id: string | null;
  created_at: string;
  metadata?: { error?: string } | null;
  projects?: { name?: string } | null;
};

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/60", label: "Pending" },
  building: { icon: Loader, color: "text-accent", bg: "bg-accent/10", label: "Building" },
  ready: { icon: CheckCircle, color: "text-positive", bg: "bg-positive/10", label: "Ready" },
  failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
  cancelled: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/60", label: "Cancelled" },
  not_deployed: { icon: Globe, color: "text-muted-foreground", bg: "bg-muted/60", label: "Not deployed" },
} as const;

export function DeployView() {
  const [deployments, setDeployments] = React.useState<DeploymentRow[]>([]);
  const [connection, setConnection] = React.useState<{
    state: string;
    message?: string;
    showDetails?: boolean;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [histRes, connRes] = await Promise.all([
        fetch("/api/deploy/history", { credentials: "include" }),
        fetch("/api/deploy/vercel/connect-status", { credentials: "include" }),
      ]);
      if (histRes.ok) {
        const data = (await histRes.json()) as { deployments?: DeploymentRow[] };
        setDeployments(data.deployments ?? []);
      }
      if (connRes.ok) setConnection(await connRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = deployments.filter((d) => d.status === "ready" || d.status === "building");

  return (
    <div className="relative mx-auto max-w-5xl space-y-8 pb-10">
      <motion.div variants={variants.fadeUp} initial="hidden" animate="show" className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground">DEPLOYMENT</p>
          <h1 className="mt-3 text-[clamp(1.75rem,3.5vw,2.4rem)] font-semibold tracking-[-0.055em] text-foreground">
            Deployment Center
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {active.length} active deployment{active.length !== 1 ? "s" : ""} · URLs from Vercel only
          </p>
        </div>
        <div className="flex gap-2">
          <PublicUrlModeBadge />
          <Button variant="secondary" size="md" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} strokeWidth={1.75} />
          </Button>
          <Button variant="accent" size="md" asChild>
            <a href="/projects">
              <Rocket className="size-4" strokeWidth={1.75} />
              Deploy project
            </a>
          </Button>
        </div>
      </motion.div>

      {connection && connection.showDetails !== false && (
        <div
          className={cn(
            "rounded-xl border p-4 text-[13px]",
            connection.state === "missing_env" ||
              connection.state === "token_invalid" ||
              connection.state === "needs_project_link"
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-border bg-surface/60",
          )}
        >
          <p className="font-medium">Vercel: {connection.state.replace(/_/g, " ")}</p>
          {connection.message && <p className="mt-1 text-muted-foreground">{connection.message}</p>}
          {(connection.state === "missing_env" || connection.state === "token_invalid") && (
            <div className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
              <p className="font-medium text-foreground">
                Deployment to Vercel is not connected yet. Builds and previews still work, but publishing
                to Vercel requires VERCEL_ACCESS_TOKEN.
              </p>
              <p className="font-medium text-foreground">How to connect (server-only, not Supabase):</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Create a token at{" "}
                  <a
                    href="https://vercel.com/account/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    vercel.com/account/settings/tokens
                  </a>
                </li>
                <li>
                  Add <code className="rounded bg-muted px-1">VERCEL_ACCESS_TOKEN</code> to{" "}
                  <strong>.env.local</strong> (local) or <strong>Vercel → Project → Environment Variables → Production</strong>
                </li>
                <li>Redeploy, then refresh this page</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : deployments.length === 0 ? (
        <motion.div
          variants={variants.fadeUp}
          initial="hidden"
          animate="show"
          className="rounded-[var(--radius-xl)] bg-surface ring-1 ring-border px-8 py-16 text-center"
        >
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border">
            <Rocket className="size-8 text-muted-foreground/40" strokeWidth={1.25} />
          </div>
          <p className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">No deployments yet</p>
          <p className="mt-2 max-w-[360px] mx-auto text-[13px] leading-relaxed text-muted-foreground">
            Open a project in the builder and deploy when Vercel is connected. Deployment URLs appear only after Vercel confirms them.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {deployments.map((dep) => {
            const cfg = STATUS_CONFIG[dep.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
            const err = dep.metadata?.error;
            return (
              <div key={dep.id} className="rounded-[var(--radius-xl)] bg-surface p-4 ring-1 ring-border">
                <div className="flex items-center gap-4">
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", cfg.bg)}>
                    <cfg.icon className={cn("size-4", cfg.color, dep.status === "building" && "animate-spin")} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground">{dep.projects?.name ?? dep.project_id.slice(0, 8)}</p>
                    <p className="text-[12px] text-muted-foreground capitalize">{dep.provider} · {cfg.label}</p>
                    {dep.deployment_url && dep.status === "ready" ? (
                      <p className="mt-1 truncate font-mono text-[11px] text-positive">{dep.deployment_url}</p>
                    ) : null}
                    {err ? (
                      <p className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                        <Terminal className="mt-0.5 size-3 shrink-0" />
                        {err}
                      </p>
                    ) : null}
                  </div>
                  {dep.deployment_url && dep.status === "ready" && (
                    <Button variant="secondary" size="sm" asChild>
                      <a href={dep.deployment_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-3.5" />
                        Open
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
