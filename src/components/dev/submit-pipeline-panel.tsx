"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSubmitPipelineSnapshot,
  isSubmitPipelineVisible,
  subscribeSubmitPipeline,
  type PipelineStep,
  type SubmitPipelineChannel,
} from "@/lib/dev/submit-pipeline-trace";

function StepIcon({ level }: { level: PipelineStep["level"] }) {
  if (level === "error") return <AlertCircle className="size-3 shrink-0 text-destructive" strokeWidth={2} />;
  if (level === "ok") return <CheckCircle2 className="size-3 shrink-0 text-emerald-600" strokeWidth={2} />;
  if (level === "warn") return <AlertCircle className="size-3 shrink-0 text-amber-600" strokeWidth={2} />;
  return <Info className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} />;
}

export function SubmitPipelinePanel({
  channel,
  inputLen,
  mode,
}: {
  channel: SubmitPipelineChannel;
  inputLen: number;
  mode?: string;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const snap = React.useSyncExternalStore(
    subscribeSubmitPipeline,
    () => getSubmitPipelineSnapshot(channel),
    () => getSubmitPipelineSnapshot(channel),
  );

  const visible = isSubmitPipelineVisible();
  const hasActivity = snap.clicked || snap.submitted || snap.steps.length > 0;
  const hasError = Boolean(snap.lastError);

  React.useEffect(() => {
    if (hasError) setExpanded(true);
  }, [hasError]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-2 overflow-hidden rounded-lg border text-left font-mono text-[10px] leading-relaxed shadow-sm",
        hasError
          ? "border-destructive/50 bg-destructive/10"
          : "border-amber-500/35 bg-amber-500/5",
      )}
      data-submit-pipeline={channel}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <span className={cn("font-semibold", hasError ? "text-destructive" : "text-foreground")}>
          Submit pipeline {hasError ? "— failed" : hasActivity ? "— active" : "— waiting for click"}
        </span>
        {expanded ? <ChevronUp className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
      </button>

      <div className="border-t border-border/40 px-2.5 py-1.5 text-[9px] text-muted-foreground">
        clicked={snap.clicked ? "yes" : "no"} · submit={snap.submitted ? "yes" : "no"} · preflight=
        {snap.preflight} · chat={snap.chat} · blocked={snap.blocked} · len={inputLen}
        {mode ? ` · mode=${mode}` : ""}
      </div>

      {hasError && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t border-destructive/30 bg-destructive/15 px-2.5 py-2 text-[11px] font-semibold text-destructive"
        >
          {snap.lastError}
        </motion.div>
      )}

      {expanded && (
        <ul className="max-h-36 space-y-1 overflow-y-auto border-t border-border/40 px-2.5 py-2 [scrollbar-gutter:stable]">
          {snap.steps.length === 0 ? (
            <li className="text-muted-foreground">No events yet — click Build / Send.</li>
          ) : (
            snap.steps.map((s) => (
              <li key={s.id} className="flex items-start gap-1.5">
                <StepIcon level={s.level} />
                <span className="shrink-0 text-muted-foreground/70">
                  {new Date(s.at).toISOString().slice(11, 19)}
                </span>
                <span
                  className={cn(
                    s.level === "error" && "text-destructive",
                    s.level === "ok" && "text-emerald-700 dark:text-emerald-400",
                    s.level === "warn" && "text-amber-800 dark:text-amber-200",
                  )}
                >
                  {s.message}
                  {s.detail ? ` — ${s.detail}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
