"use client";

import { cn } from "@/lib/utils";

export type ComposerSubmitPhase =
  | "idle"
  | "clicked"
  | "preflight"
  | "chat"
  | "done"
  | "error";

/** Always-visible submit feedback under the composer (not gated on localhost). */
export function ComposerSubmitStatus({
  phase,
  detail,
  error,
  className,
}: {
  phase: ComposerSubmitPhase;
  detail?: string | null;
  error?: string | null;
  className?: string;
}) {
  const label =
    phase === "idle"
      ? "Ready — click Build or press Enter"
      : phase === "clicked"
        ? "Clicked — starting…"
        : phase === "preflight"
          ? "Checking credits & session…"
          : phase === "chat"
            ? "Sending to AI…"
            : phase === "done"
              ? "Sent"
              : "Failed";

  const busy = phase === "clicked" || phase === "preflight" || phase === "chat";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-snug",
        error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : busy
            ? "border-accent/30 bg-accent/5 text-foreground"
            : "border-border/60 bg-surface/50 text-muted-foreground",
        className,
      )}
    >
      <p className="font-semibold">{label}</p>
      {detail && !error && <p className="mt-0.5 font-mono text-[10px] opacity-80">{detail}</p>}
      {error && <p className="mt-1 font-medium">{error}</p>}
    </div>
  );
}

