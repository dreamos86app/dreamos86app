"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WorkflowRunStatus } from "@/lib/build/workflow-status-guards";

export type BuildRunSummaryVariant = "completed" | "partial" | "failed";

export function BuildRunSummaryCard({
  variant,
  status,
  headline,
  bodyLines = [],
  appName,
  filesCount,
  pages,
  previewReady,
  publishReady,
  creditsUsed,
  errorMessage,
  refunded,
  showRefundLine = false,
  showRepairActions = false,
  showPreviewActions = false,
  onContinue,
  onRepair,
  className,
}: {
  variant: BuildRunSummaryVariant;
  status?: WorkflowRunStatus;
  headline?: string;
  bodyLines?: string[];
  appName?: string;
  filesCount?: number;
  pages?: string[];
  previewReady?: boolean;
  publishReady?: boolean;
  creditsUsed?: number;
  completedSummary?: string;
  remainingSummary?: string;
  errorMessage?: string;
  refunded?: boolean;
  showRefundLine?: boolean;
  showRepairActions?: boolean;
  showPreviewActions?: boolean;
  onContinue?: () => void;
  onRepair?: () => void;
  className?: string;
}) {
  const partial = variant === "partial" || status === "partial_credit_stop";
  const failed = variant === "failed";

  const title =
    headline ??
    (failed
      ? status === "failed_before_generation"
        ? "Couldn't start the build"
        : "Build needs attention"
      : partial
        ? "Partial progress saved"
        : "Build complete");

  const lines =
    bodyLines.length > 0
      ? bodyLines
      : [
          ...(variant === "completed" && typeof filesCount === "number"
            ? [`${filesCount} file${filesCount === 1 ? "" : "s"} created or updated`]
            : []),
          ...(pages?.length ? [`Screens: ${pages.slice(0, 5).join(", ")}`] : []),
          ...(partial && typeof creditsUsed === "number"
            ? [`Used ${creditsUsed} Build Credit${creditsUsed === 1 ? "" : "s"} on this pass.`]
            : []),
          ...(failed && errorMessage ? [errorMessage] : []),
          ...(showRefundLine || refunded ? ["Credits were returned for this attempt."] : []),
        ].filter(Boolean);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-gradient-to-br from-background via-surface to-background shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)] ring-1",
        failed ? "ring-destructive/30" : partial ? "ring-amber-500/30" : "ring-accent/30",
        className,
      )}
      data-testid="build-run-summary"
      data-variant={variant}
      data-status={status}
    >
      <div
        className={cn(
          "h-[2px] w-full bg-gradient-to-r",
          failed
            ? "from-destructive/80 to-destructive/40"
            : partial
              ? "from-amber-500 via-orange-400 to-amber-600"
              : "from-violet-600 via-accent to-sky-500",
        )}
      />
      <div className="px-4 py-3.5">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        {appName && variant === "completed" ? (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{appName}</p>
        ) : null}

        {lines.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        {variant === "completed" && previewReady != null ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Preview: {previewReady ? "Ready" : "Preparing"}
            {publishReady != null
              ? ` · Publish: ${publishReady ? "Ready when you are" : "Finish setup in dashboard"}`
              : ""}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {showPreviewActions && (
            <button
              type="button"
              className="rounded-xl bg-accent px-3 py-2 text-[11.5px] font-semibold text-white shadow-sm"
              data-testid="summary-open-preview"
            >
              Open preview
            </button>
          )}
          {partial && onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-xl bg-accent px-3 py-2 text-[11.5px] font-semibold text-white shadow-sm"
            >
              Continue build
            </button>
          ) : null}
          {showRepairActions && onRepair ? (
            <button
              type="button"
              onClick={onRepair}
              className="rounded-xl border border-border/70 bg-background px-3 py-2 text-[11.5px] font-medium text-foreground"
              data-testid="summary-repair-build"
            >
              Repair build
            </button>
          ) : null}
          {partial || (failed && !showPreviewActions) ? (
            <>
              <Link
                href="/pricing"
                className="rounded-xl bg-surface px-3 py-2 text-[11.5px] font-medium text-foreground ring-1 ring-border"
              >
                {failed && status === "insufficient_credits_before_start" ? "Upgrade" : "Add credits"}
              </Link>
              {partial ? (
                <button
                  type="button"
                  className="rounded-xl bg-surface px-3 py-2 text-[11.5px] font-medium text-muted-foreground ring-1 ring-border"
                >
                  Continue later
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
