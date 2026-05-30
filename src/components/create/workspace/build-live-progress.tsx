"use client";

import type { BuildJobPollState } from "@/hooks/use-build-job-progress";
import { AgentWorkflowStream } from "@/components/create/workspace/agent-workflow-stream";
import { DreamOS86BrandIcon } from "@/components/brand/dreamos86-brand-icon";
import { Loader2 } from "lucide-react";

/** Live async build progress — agent workflow stream (replaces rigid checklist). */
export function BuildLiveProgress({
  progress,
  className,
  buildStartedAtMs,
  openerText,
}: {
  progress: BuildJobPollState | null;
  className?: string;
  buildStartedAtMs?: number;
  openerText?: string;
}) {
  return (
    <AgentWorkflowStream
      progress={progress}
      className={className}
      buildStartedAtMs={buildStartedAtMs}
      openerText={openerText}
    />
  );
}

export function BuildProgressHeader({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <DreamOS86BrandIcon variant="assistant" alt="" />
      <span className="text-[12px] font-semibold text-foreground">DreamOS86</span>
      <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-400">
        Build
      </span>
      <Loader2 className="ml-1 size-3 animate-spin text-accent" />
    </div>
  );
}
