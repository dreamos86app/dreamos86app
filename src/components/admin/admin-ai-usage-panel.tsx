"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Bucket = {
  requests: number;
  credits: number;
  providerCostUsd: number;
  revenueUsd: number;
  marginUsd: number;
};

type Summary = {
  totals: Bucket;
  byMode: Record<string, Bucket>;
  byModelMode: Record<string, Bucket>;
  chatOnly: Bucket;
  createModes: Bucket;
  eventCount: number;
  marginTarget: string;
};

type Event = {
  id: string;
  created_at: string;
  user_email: string;
  model_id: string;
  mode: string;
  tokens_charged: number;
  status: string;
};

function fmtUsd(n: number) {
  return `$${n.toFixed(4)}`;
}

function BucketCard({
  title,
  bucket,
  subtitle,
  className,
}: {
  title: string;
  bucket: Bucket;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-surface p-4 ring-1 ring-border", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-[22px] font-semibold tabular-nums text-foreground">
        {fmtUsd(bucket.providerCostUsd)}
      </p>
      <p className="text-[11px] text-muted-foreground">{subtitle ?? "Est. provider cost (90d)"}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-muted-foreground">Credits charged</span>
          <p className="font-semibold text-foreground">{bucket.credits.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-muted-foreground">User revenue</span>
          <p className="font-semibold text-foreground">{fmtUsd(bucket.revenueUsd)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Requests</span>
          <p className="font-semibold text-foreground">{bucket.requests}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Est. margin</span>
          <p
            className={cn(
              "font-semibold",
              bucket.marginUsd >= 0 ? "text-emerald-600" : "text-destructive",
            )}
          >
            {fmtUsd(bucket.marginUsd)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AdminAiUsagePanel() {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetch("/api/admin/ai-usage/summary"),
      fetch("/api/admin/ai-usage"),
    ])
      .then(async ([sumRes, evRes]) => {
        const sum = (await sumRes.json()) as Summary & { error?: string };
        const ev = (await evRes.json()) as { events?: Event[] };
        if (cancelled) return;
        if (!sumRes.ok) {
          setError(sum.error ?? "Could not load summary");
          return;
        }
        setSummary(sum);
        if (evRes.ok) setEvents(ev.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load AI usage");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !summary) {
    return <p className="py-10 text-center text-[13px] text-destructive">{error ?? "No data"}</p>;
  }

  const modeRows = Object.entries(summary.byMode).sort(
    (a, b) => b[1].providerCostUsd - a[1].providerCostUsd,
  );
  const modelRows = Object.entries(summary.byModelMode)
    .sort((a, b) => b[1].providerCostUsd - a[1].providerCostUsd)
    .slice(0, 24);

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-muted-foreground">{summary.marginTarget}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BucketCard title="Total provider cost" bucket={summary.totals} />
        <BucketCard title="AI Chat (discuss)" bucket={summary.chatOnly} />
        <BucketCard title="Create (build + edit)" bucket={summary.createModes} />
        <BucketCard
          title="Total margin"
          bucket={summary.totals}
          subtitle="Revenue minus provider cost"
        />
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">Cost by mode</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium">Requests</th>
                <th className="px-4 py-2 font-medium">Credits</th>
                <th className="px-4 py-2 font-medium">Provider cost</th>
                <th className="px-4 py-2 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {modeRows.map(([mode, b]) => (
                <tr key={mode} className="border-b border-border/60">
                  <td className="px-4 py-2 font-medium capitalize text-foreground">{mode}</td>
                  <td className="px-4 py-2 tabular-nums">{b.requests}</td>
                  <td className="px-4 py-2 tabular-nums">{b.credits}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtUsd(b.providerCostUsd)}</td>
                  <td
                    className={cn(
                      "px-4 py-2 tabular-nums font-medium",
                      b.marginUsd >= 0 ? "text-emerald-600" : "text-destructive",
                    )}
                  >
                    {fmtUsd(b.marginUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border">
        <motion.div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">Cost by model × mode</p>
        </motion.div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium">Cost</th>
                <th className="px-4 py-2 font-medium">Credits</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.map(([key, b]) => {
                const [model, mode] = key.split("::");
                return (
                  <tr key={key} className="border-b border-border/50">
                    <td className="px-4 py-1.5 font-mono text-[11px]">{model}</td>
                    <td className="px-4 py-1.5 capitalize">{mode}</td>
                    <td className="px-4 py-1.5 tabular-nums">{fmtUsd(b.providerCostUsd)}</td>
                    <td className="px-4 py-1.5 tabular-nums">{b.credits}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">Recent events</p>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto p-2">
          {events.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">No events yet</p>
          ) : (
            events.slice(0, 80).map((ev) => (
              <div
                key={ev.id}
                className="rounded-lg px-3 py-2 text-[11.5px] ring-1 ring-border/60"
              >
                <span className="font-medium">{ev.model_id}</span>
                <span className="text-muted-foreground"> · {ev.mode} · </span>
                <span>{ev.tokens_charged} credits</span>
                <span className="text-muted-foreground"> · {ev.user_email}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

