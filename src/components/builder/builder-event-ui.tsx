"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  FilePlus,
  FilePen,
  Loader2,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuildPlanCard } from "@/lib/creation/parse-build-plan";
import type { BuilderOutputContract } from "@/lib/creation/parse-builder-metadata";
import { AgentPhases } from "@/components/create/workspace/agent-phases";

export function BuilderPlanCard({
  plan,
  className,
}: {
  plan: BuildPlanCard;
  className?: string;
}) {
  const steps = plan.taskLabels.slice(0, 6);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-gradient-to-br from-accent/[0.08] via-background to-sky-500/[0.06] ring-1 ring-accent/20",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-border/60 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-accent" strokeWidth={1.75} />
          <p className="text-[12px] font-semibold text-foreground">
            {plan.summary ? "Build plan" : `I'll build this in ${steps.length} steps`}
          </p>
        </div>
        {plan.summary && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{plan.summary}</p>
        )}
      </motion.div>
      <ul className="space-y-0.5 px-3 py-2">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2 text-[12px] text-foreground/90">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BuilderStepCard({
  label,
  description,
  status,
}: {
  label: string;
  description?: string;
  status: "pending" | "active" | "done";
}) {
  return (
    <motion.div
      layout
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3 py-2 ring-1 transition",
        status === "active" && "bg-accent/[0.08] ring-accent/30 shadow-[0_0_20px_-8px_hsl(var(--accent)/0.5)]",
        status === "done" && "bg-surface/80 ring-border/80",
        status === "pending" && "bg-surface/40 ring-border/50 opacity-70",
      )}
    >
      {status === "done" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
      ) : status === "active" ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-accent" strokeWidth={2} />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" strokeWidth={1.75} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
    </motion.div>
  );
}

export function BuilderProgressTimeline({
  labels,
  activeIndex,
  className,
}: {
  labels: string[];
  activeIndex: number;
  className?: string;
}) {
  const descriptions = [
    "Mapping routes, data, and screens",
    "Colors, typography, and components",
    "Tables, fields, and relationships",
    "API routes and server actions",
    "Pages, layouts, and interactions",
    "Preview and polish",
  ];
  return (
    <motion.div className={cn("space-y-1.5", className)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {labels.map((label, i) => (
        <BuilderStepCard
          key={`${label}-${i}`}
          label={label}
          description={descriptions[i] ?? undefined}
          status={i < activeIndex ? "done" : i === activeIndex ? "active" : "pending"}
        />
      ))}
    </motion.div>
  );
}

export function BuilderActionRow({
  action,
  path,
}: {
  action: "created" | "updated" | "read" | "tested" | "fixed";
  path: string;
}) {
  const Icon = action === "updated" ? FilePen : FilePlus;
  const verb =
    action === "created"
      ? "Created"
      : action === "updated"
        ? "Updated"
        : action === "read"
          ? "Read"
          : action === "tested"
            ? "Tested"
            : "Fixed";
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface/60 px-2.5 py-1.5 text-[11.5px] ring-1 ring-border/60">
      <Icon className="size-3.5 shrink-0 text-accent/80" strokeWidth={1.75} />
      <span className="text-muted-foreground">{verb}</span>
      <code className="truncate font-mono text-[11px] text-foreground">{path}</code>
    </div>
  );
}

export function BuilderFileChangeList({ files }: { files: Array<{ path: string; action?: string }> }) {
  if (!files.length) return null;
  return (
    <motion.div className="space-y-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {files.slice(0, 12).map((f) => (
        <BuilderActionRow
          key={f.path}
          action={f.action === "updated" ? "updated" : "created"}
          path={f.path}
        />
      ))}
      {files.length > 12 && (
        <p className="px-1 text-[10.5px] text-muted-foreground">+{files.length - 12} more in Code tab</p>
      )}
    </motion.div>
  );
}

export function BuilderResultSummary({
  meta,
  creditsUsed,
  className,
}: {
  meta: BuilderOutputContract | null;
  creditsUsed?: number | null;
  className?: string;
}) {
  if (!meta?.app?.name && !meta?.summary) return null;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-gradient-to-br from-accent/10 via-background to-violet-500/[0.06] ring-1 ring-accent/25",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3 px-3 py-3"
      >
        <motion.div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/25"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="size-4 text-accent" strokeWidth={1.75} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Done — {meta.app?.name ? `I created ${meta.app.name}` : "Build complete"}
          </p>
          {meta.summary ? (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{meta.summary}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(meta.pages?.length ?? 0) > 0 && (
              <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-border">
                {meta.pages!.length} screens
              </span>
            )}
            {(meta.entities?.length ?? 0) > 0 && (
              <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-border">
                {meta.entities!.length} entities
              </span>
            )}
            {typeof creditsUsed === "number" && creditsUsed > 0 && (
              <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-border">
                {creditsUsed} credits used
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Build-mode assistant message: plan cards + phases, no raw code dumps. */
export function BuilderAssistantMessage({
  text,
  streaming,
  meta,
  plan,
  progressIndex,
  creditsUsed,
}: {
  text: string;
  streaming?: boolean;
  meta: BuilderOutputContract | null;
  plan: BuildPlanCard;
  progressIndex: number;
  creditsUsed?: number | null;
}) {
  const showPlan = plan.phases.length > 0 || plan.summary;
  const showTimeline = streaming && plan.taskLabels.length > 0;
  const fileRows =
    meta?.files?.map((f) =>
      typeof f === "string" ? { path: f, action: "created" } : { path: f.path, action: f.action },
    ) ?? [];

  return (
    <div className="space-y-2.5">
      {showPlan && !streaming && <BuilderPlanCard plan={plan} />}
      {showTimeline && (
        <BuilderProgressTimeline labels={plan.taskLabels} activeIndex={progressIndex} />
      )}
      {fileRows.length > 0 && !streaming && <BuilderFileChangeList files={fileRows} />}
      <AgentPhases text={text} streaming={streaming} suppressCode />
      {!streaming && <BuilderResultSummary meta={meta} creditsUsed={creditsUsed} />}
    </div>
  );
}
