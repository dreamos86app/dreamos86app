"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { useHydrated } from "@/lib/hooks/use-hydrated";

type Project = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
};

function StatCell({
  label,
  value,
  detail,
  loading,
  index,
}: {
  label: string;
  value: string;
  detail?: string;
  loading?: boolean;
  index: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl border border-border/70 bg-background/80 p-4 ring-1 ring-border/40"
    >
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <p className="text-[22px] font-semibold tabular-nums text-foreground">{value}</p>
      )}
      <p className="mt-1 text-[12px] font-medium text-foreground">{label}</p>
      {detail ? <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p> : null}
    </motion.div>
  );
}

export function WorkspaceStatsSection({ projects }: { projects: Project[] }) {
  const hydrated = useHydrated();
  const credits = useCreditsStore((s) => s.remaining);
  const isConfirmed = useCreditsStore((s) => s.isConfirmed);
  const creditsLoading = useCreditsStore((s) => s.loading);
  const ref = React.useRef<HTMLElement>(null);
  useInView(ref, { once: true });

  const total = projects.length;
  const published = projects.filter((p) => /publish|live/i.test(p.status)).length;
  const needsAttention = projects.filter((p) => /draft|error|failed|attention/i.test(p.status)).length;
  const recentBuilds = projects.filter((p) => {
    const d = new Date(p.updated_at).getTime();
    return Date.now() - d < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const loading = !hydrated;

  return (
    <section ref={ref} data-testid="dreamos-workspace-numbers" className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-foreground">Your workspace</h2>
        <p className="text-[13px] text-muted-foreground">Live stats from your apps and credits.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCell label="Apps created" value={String(total)} index={0} loading={loading && total === 0} />
        <StatCell
          label="Needs attention"
          value={String(needsAttention)}
          detail={needsAttention ? "review drafts or errors" : "all clear"}
          index={1}
          loading={loading && total === 0}
        />
        <StatCell label="Published" value={String(published)} index={2} loading={loading && total === 0} />
        <StatCell
          label="Credits balance"
          value={!hydrated || !isConfirmed ? (creditsLoading ? "…" : "—") : String(credits ?? 0)}
          detail="available now"
          index={3}
          loading={!hydrated || (!isConfirmed && creditsLoading)}
        />
        <StatCell
          label="Recent builds"
          value={String(recentBuilds)}
          detail="last 7 days"
          index={4}
          loading={loading && total === 0}
        />
      </div>
    </section>
  );
}
