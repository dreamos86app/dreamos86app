"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  FileMinus,
  FilePen,
  FilePlus,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuildJobPollState } from "@/hooks/use-build-job-progress";
import {
  applySingleActiveWorkflowStep,
  collapseRedundantPhaseStarted,
  coalesceWorkflowStreamEvents,
} from "@/lib/build/workflow-stream-coalesce";
import type { AgentWorkflowEvent } from "@/lib/build/workflow-stream-types";
import { isValidWorkflowFilePath } from "@/lib/workflow/workflow-file-path";
import {
  buildEphemeralWorkflowEvents,
  mergeEphemeralWithServerEvents,
} from "@/lib/workflow/workflow-ephemeral-steps";

function isFileEvent(ev: AgentWorkflowEvent): boolean {
  return (
    (ev.category === "file_created" || ev.category === "file_edited" || ev.category === "file_deleted") &&
    Boolean(ev.filePath && isValidWorkflowFilePath(ev.filePath))
  );
}

function groupFileEvents(events: AgentWorkflowEvent[]): AgentWorkflowEvent[] {
  const out: AgentWorkflowEvent[] = [];
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    if (!isFileEvent(ev)) {
      out.push(ev);
      i += 1;
      continue;
    }
    const batch: AgentWorkflowEvent[] = [ev];
    let j = i + 1;
    while (j < events.length && isFileEvent(events[j])) {
      batch.push(events[j]);
      j += 1;
    }
    if (batch.length >= 4) {
      out.push({
        id: `group-${batch[0].id}`,
        category: "file_created",
        title: `Created ${batch.length} files`,
        status: batch.some((b) => b.status === "active") ? "active" : "done",
        at: batch[batch.length - 1].at,
        stableKey: `file-group:${batch[0].stableKey}`,
        metadata: { file_group: batch.map((b) => b.filePath).filter(Boolean) },
      });
    } else {
      out.push(...batch);
    }
    i = j;
  }
  return out;
}

function FileChangeCard({ event }: { event: AgentWorkflowEvent }) {
  const paths = Array.isArray(event.metadata?.file_group)
    ? (event.metadata.file_group as string[])
    : null;
  const [open, setOpen] = React.useState(false);

  if (paths && paths.length > 0) {
    return (
      <div className="mr-6 sm:mr-10" data-testid="workflow-file-group">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full max-w-md items-center gap-2 rounded-2xl bg-surface/90 px-3 py-2 text-left ring-1 ring-border/60"
        >
          <FilePlus className="size-3.5 shrink-0 text-accent/85" />
          <span className="text-[10.5px] font-medium text-foreground">{event.title}</span>
          <ChevronDown className={cn("ml-auto size-3.5 transition", open && "rotate-180")} />
        </button>
        {open ? (
          <ul className="mt-1 max-w-md space-y-1 pl-2">
            {paths.map((p) => (
              <li key={p}>
                <code className="font-mono text-[10px] text-muted-foreground">{p}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const isCreate = event.category === "file_created";
  const isDelete = event.category === "file_deleted";
  const Icon = isDelete ? FileMinus : isCreate ? FilePlus : FilePen;
  const verb = isDelete ? "Deleted" : isCreate ? "Created" : "Edited";
  const path = event.filePath!;
  const hasCounts =
    typeof event.addedLines === "number" || typeof event.removedLines === "number";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mr-6 flex max-w-md items-center gap-2 rounded-2xl bg-surface/90 px-3 py-2 ring-1 ring-border/60 sm:mr-10"
      data-testid="workflow-file-card"
    >
      <Icon className="size-3.5 shrink-0 text-accent/85" strokeWidth={1.75} />
      <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">{verb}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground">{path}</code>
      {hasCounts && !isDelete ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {typeof event.addedLines === "number" ? `+${event.addedLines}` : ""}
          {typeof event.removedLines === "number" ? ` -${event.removedLines}` : ""}
        </span>
      ) : null}
    </motion.div>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mr-6 max-w-[min(100%,34rem)] rounded-2xl bg-accent/[0.07] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground ring-1 ring-accent/20 sm:mr-10"
      data-testid="workflow-chat-assistant"
    >
      {children}
    </div>
  );
}

function ProgressRow({ event, reducedMotion }: { event: AgentWorkflowEvent; reducedMotion: boolean }) {
  const done = event.status === "done";
  const active = event.status === "active";
  const failed = event.status === "failed";

  return (
    <motion.div
      layout={!reducedMotion}
      initial={reducedMotion ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mr-6 flex max-w-md items-start gap-2 text-[11px] sm:mr-10",
        done && "opacity-70",
      )}
      data-testid={`workflow-event-${event.category}`}
    >
      {active ? (
        <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-accent" strokeWidth={2} />
      ) : done ? (
        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-accent/75" strokeWidth={1.75} />
      ) : failed ? (
        <span className="mt-1 size-2 shrink-0 rounded-full bg-destructive" />
      ) : (
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
      )}
      <div className="min-w-0">
        <p className={cn("font-medium", failed ? "text-destructive" : "text-foreground")}>{event.title}</p>
        {event.subtitle ? <p className="mt-0.5 text-muted-foreground">{event.subtitle}</p> : null}
      </div>
    </motion.div>
  );
}

function TimelineRow({ event, reducedMotion }: { event: AgentWorkflowEvent; reducedMotion: boolean }) {
  if (isFileEvent(event)) return <FileChangeCard event={event} />;
  if (event.category === "assistant_message") {
    return <AssistantBubble>{event.subtitle ?? event.title}</AssistantBubble>;
  }
  return <ProgressRow event={event} reducedMotion={reducedMotion} />;
}

/** Build activity as chat rows — parent chat column owns scrolling. */
export function AgentWorkflowStream({
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
  const reducedMotion = useReducedMotion();
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!progress || progress.done) return;
    const t = setInterval(() => setNow(Date.now()), 450);
    return () => clearInterval(t);
  }, [progress]);

  if (!progress) return null;

  const working = Boolean(!progress.done);
  const serverRaw = coalesceWorkflowStreamEvents(progress.events, { terminal: progress.done });
  const serverCollapsed = collapseRedundantPhaseStarted(serverRaw);
  const serverSequential = applySingleActiveWorkflowStep(serverCollapsed, !progress.done);

  const startedAt =
    buildStartedAtMs ?? (Date.parse(progress.events[0]?.created_at ?? "") || now - 500);
  const ephemeral =
    working && serverSequential.length < 2
      ? buildEphemeralWorkflowEvents(startedAt, now, openerText)
      : [];
  const merged = mergeEphemeralWithServerEvents(ephemeral, serverSequential);
  const grouped = groupFileEvents(merged);
  const timeline = applySingleActiveWorkflowStep(grouped, working).slice(-24);

  const active = timeline.find((e) => e.status === "active");
  const failed =
    progress.done &&
    (progress.status === "failed" || progress.latest?.type === "failed");

  return (
    <div className={cn("space-y-2.5", className)} data-testid="agent-workflow-stream">
      {progress.reconnecting ? (
        <p className="px-1 text-[10px] text-muted-foreground">Reconnecting to build status…</p>
      ) : null}

      {active ? (
        <div
          className="mr-6 flex max-w-md items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2 text-[11px] sm:mr-10"
          data-testid="workflow-active-step"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
          <span className="font-medium text-foreground">{active.title}</span>
        </div>
      ) : null}

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {timeline
            .filter((ev) => ev.stableKey !== active?.stableKey)
            .map((ev) => (
              <li key={ev.stableKey}>
                <TimelineRow event={ev} reducedMotion={Boolean(reducedMotion)} />
              </li>
            ))}
        </AnimatePresence>
      </ul>

      {failed && progress.error ? (
        <p className="mr-6 rounded-lg bg-destructive/10 px-2 py-1.5 text-[10.5px] text-destructive sm:mr-10">
          {progress.error}
        </p>
      ) : null}
    </div>
  );
}
