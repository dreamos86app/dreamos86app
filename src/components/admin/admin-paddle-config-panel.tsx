"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Loader2, RefreshCw, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PaddleAdminConfigStatus } from "@/lib/billing/paddle-config-status";
import { paddleOwnerTestCheckoutEnabled } from "@/lib/billing/paddle-public-checkout";
import { toast } from "@/lib/toast";

export function AdminPaddleConfigPanel() {
  const [loading, setLoading] = React.useState(true);
  const [verifying, setVerifying] = React.useState(false);
  const [config, setConfig] = React.useState<PaddleAdminConfigStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (verify = false) => {
    if (verify) setVerifying(true);
    else setLoading(true);
    try {
      const url = verify ? "/api/admin/billing/paddle?verify=1" : "/api/admin/billing/paddle";
      const res = await fetch(url, { credentials: "include" });
      const json = (await res.json()) as PaddleAdminConfigStatus & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setConfig(json);
      if (verify) {
        toast.success(json.apiVerify?.ok ? "Paddle API verification passed" : "Verification has errors");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function copyChecklist() {
    if (!config) return;
    await navigator.clipboard.writeText(config.vercelEnvChecklist.join("\n"));
    toast.success("Vercel env checklist copied");
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
        {error ?? "Could not load Paddle config"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {config.liveModeWarning ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px]">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            {config.liveModeWarning}
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-surface/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold">Production readiness</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1 size-3.5" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={verifying}
              onClick={() => void load(true)}
            >
              {verifying ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Verify via Paddle API
            </Button>
          </div>
        </div>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Environment</dt>
            <dd className="font-medium capitalize">{config.environment}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Env consistency</dt>
            <dd className="font-medium">{config.envConsistencyOk ? "OK" : "Blocked"}</dd>
          </div>
          <CredentialRow label="API key" ok={config.credentials.apiKeyConfigured} />
          <MatchRow label="API key matches env" ok={config.credentials.apiKeyMatchesEnvironment} />
          <CredentialRow label="Client token" ok={config.credentials.clientTokenConfigured} />
          <MatchRow label="Client token matches env" ok={config.credentials.clientTokenMatchesEnvironment} />
          <CredentialRow label="Webhook secret" ok={config.credentials.webhookSecretConfigured} />
          <div>
            <dt className="text-muted-foreground">Public checkout</dt>
            <dd className="font-medium">{config.publicCheckoutEnabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owner test checkout</dt>
            <dd className="font-medium">{config.ownerTestCheckoutEnabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">All 18 price IDs</dt>
            <dd className="font-medium">{config.allPriceIdsConfigured ? "Yes" : "Missing"}</dd>
          </div>
        </dl>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground break-all">
          Webhook: {config.webhookUrl}
        </p>
        {config.envErrors.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-[12px] text-destructive">
            {config.envErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void copyChecklist()}>
            <Copy className="mr-1 size-3.5" />
            Copy Vercel env checklist
          </Button>
          {config.ownerTestCheckoutEnabled && paddleOwnerTestCheckoutEnabled() ? (
            <Button type="button" variant="primary" size="sm" asChild>
              <Link href="/admin/billing/paddle/test-checkout">Open owner test checkout</Link>
            </Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-amber-500/5 px-4 py-3 text-[12px] text-muted-foreground">
        <ul className="list-disc space-y-1 pl-4">
          {config.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      {config.apiVerify ? (
        <section className="rounded-xl border border-border p-4 text-[12px]">
          <h2 className="text-[14px] font-semibold">Paddle API verification</h2>
          <p className="mt-1">
            Connection: {config.apiVerify.connectionOk ? "OK" : "Failed"} · Catalog:{" "}
            {config.apiVerify.ok ? "OK" : "Errors"}
          </p>
          {config.apiVerify.errors.length > 0 ? (
            <ul className="mt-2 list-disc pl-4 text-destructive">
              {config.apiVerify.errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-border overflow-hidden">
        <div className="border-b border-border bg-surface/50 px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">Plan price mapping (pri_* required)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Interval</th>
                <th className="px-3 py-2">Price ID</th>
                <th className="px-3 py-2">Product (opt)</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Credits</th>
                <th className="px-3 py-2">Ready</th>
              </tr>
            </thead>
            <tbody>
              {config.priceRows.map((row) => (
                <tr key={`${row.plan}-${row.interval}`} className="border-t border-border/60">
                  <td className="px-3 py-2">
                    <span className="font-medium">{row.planLabel}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">{row.planSlug}</span>
                  </td>
                  <td className="px-3 py-2 capitalize">{row.interval}</td>
                  <td className="px-3 py-2 font-mono">{row.configured ? row.priceIdMasked : "missing"}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{row.productIdMasked}</td>
                  <td className="px-3 py-2 tabular-nums">
                    ${row.amountUsd}
                    {row.interval === "annual" ? "/yr" : "/mo"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.buildCredits} / {row.actionCredits}
                  </td>
                  <td className="px-3 py-2">
                    {row.checkoutReady ? (
                      <Check className="size-4 text-positive" />
                    ) : (
                      <X className="size-4 text-destructive" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DiagnosticsTable title="Recent webhook events" rows={config.recentEvents} />
      <DiagnosticsTable title="Recent checkout attempts" rows={config.recentCheckoutAttempts} />

      <section className="rounded-xl border border-border bg-surface/40 p-4">
        <h2 className="text-[14px] font-semibold">Paddle setup</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-muted-foreground">
          {config.paddleCheckoutRecommendations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DiagnosticsTable({
  title,
  rows,
}: {
  title: string;
  rows: PaddleAdminConfigStatus["recentEvents"];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <div className="border-b border-border bg-surface/50 px-4 py-2.5">
        <h2 className="text-[14px] font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Sim</th>
              <th className="px-3 py-2">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/60">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">{row.eventType}</td>
                <td className="px-3 py-2">{row.processingStatus ?? "—"}</td>
                <td className="px-3 py-2">{row.isSimulation ? "yes" : "no"}</td>
                <td className="px-3 py-2">{row.plan ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CredentialRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium">
        {ok ? (
          <>
            <Check className="size-3.5 text-positive" /> Configured
          </>
        ) : (
          <>
            <X className="size-3.5 text-destructive" /> Missing
          </>
        )}
      </dd>
    </div>
  );
}

function MatchRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", ok ? "text-positive" : "text-destructive")}>
        {ok ? "Yes" : "No"}
      </dd>
    </div>
  );
}
