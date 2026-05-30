"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "#2563eb",
  "#7c3aed",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#64748b",
];

type ModelSlice = {
  modelId: string;
  tokens: number;
  percent: number;
};

export function ModelUsageDonut({ className }: { className?: string }) {
  const [loading, setLoading] = React.useState(true);
  const [models, setModels] = React.useState<ModelSlice[]>([]);
  const [totalTokens, setTotalTokens] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/usage/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { models?: ModelSlice[]; totalTokens?: number }) => {
        if (cancelled) return;
        setModels(json.models ?? []);
        setTotalTokens(json.totalTokens ?? 0);
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
      <div className={cn("rounded-xl border border-border bg-background p-4", className)}>
        <p className="text-[12px] text-muted-foreground">Loading model usage…</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border bg-background p-4", className)}>
        <p className="text-[12px] font-semibold text-foreground">Model usage</p>
        <p className="mt-1 text-[11px] text-muted-foreground">No logged usage this billing period yet.</p>
      </div>
    );
  }

  let offset = 0;
  const stops = models.map((m, i) => {
    const start = offset;
    offset += m.percent;
    return `${COLORS[i % COLORS.length]} ${start}% ${offset}%`;
  });

  return (
    <div className={cn("rounded-xl border border-border bg-background p-4", className)} data-testid="model-usage-donut">
      <p className="text-[12px] font-semibold text-foreground">Model usage this period</p>
      <p className="text-[10px] text-muted-foreground">{totalTokens.toLocaleString()} tokens total</p>
      <div className="mt-3 flex items-center gap-4">
        <div
          className="size-24 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
          aria-hidden
        />
        <ul className="min-w-0 flex-1 space-y-1.5">
          {models.map((m, i) => (
            <li key={m.modelId} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="truncate font-medium text-foreground">{m.modelId}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {m.percent}% · {m.tokens.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
