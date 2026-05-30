"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, Activity, CalendarClock, ArrowUpRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCreditAmount } from "@/lib/credits/credit-summary";
import type { CanonicalCreditBucket } from "@/lib/credits/canonical-credits";
import {
  creditBucketTotalCap,
  formatCreditBucketDisplay,
} from "@/lib/credits/credit-balance-display";
import { formatCreditResetLocal } from "@/lib/credits/format-credit-reset";
import { monthlyTokensForPlan, normalizePlanId } from "@/lib/billing/plans";
import { monthlyActionCreditsForPlan } from "@/lib/action-credits/action-credit-allowances";
import { Skeleton } from "@/components/ui/skeleton";

export type CreditBucketVisualState = "normal" | "bonus" | "low" | "empty" | "loading" | "error";

export type CreditsTrackerVariant = "full" | "compact" | "popover" | "mini";

function bucketState(bucket: CanonicalCreditBucket): CreditBucketVisualState {
  if (bucket.available <= 0) return "empty";
  const cap = bucket.planAllowance + bucket.bonusActive;
  if (cap > 0 && bucket.available / cap < 0.15) return "low";
  if (bucket.bonusActive > 0) return "bonus";
  return "normal";
}

function progressPct(bucket: CanonicalCreditBucket): number {
  const cap = Math.max(bucket.planAllowance + bucket.bonusActive, 1);
  return Math.min(100, (bucket.available / cap) * 100);
}

function planCapFallback(kind: "build" | "action", planId?: string): number {
  const id = normalizePlanId(planId ?? "free");
  return kind === "build" ? monthlyTokensForPlan(id) : monthlyActionCreditsForPlan(id);
}

function displayedCap(
  bucket: CanonicalCreditBucket,
  kind: "build" | "action",
  planId?: string,
  isConfirmed?: boolean,
): number {
  return creditBucketTotalCap(bucket, kind, planId ?? "free", Boolean(isConfirmed));
}

function progressPctFor(
  bucket: CanonicalCreditBucket,
  kind: "build" | "action",
  planId?: string,
  isConfirmed?: boolean,
): number {
  const display = formatCreditBucketDisplay(bucket, kind, planId ?? "free", Boolean(isConfirmed));
  const cap = Math.max(display.totalCap, 1);
  return Math.min(100, (display.remainingTotal / cap) * 100);
}

function formatResetDate(iso: string | null): string | null {
  return formatCreditResetLocal(iso);
}

function planLabel(planId: string): string {
  if (planId === "free") return "Free";
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}

type CreditRowDensity = "popover" | "compact" | "mini";

type CreditRowProps = {
  kind: "build" | "action";
  bucket: CanonicalCreditBucket;
  density: CreditRowDensity;
  planId?: string;
  isConfirmed?: boolean;
};

function CreditRow({ kind, bucket, density, planId, isConfirmed }: CreditRowProps) {
  const state = bucketState(bucket);
  const pct = progressPctFor(bucket, kind, planId, isConfirmed);
  const isBuild = kind === "build";
  const Icon = isBuild ? Zap : Activity;
  const title = isBuild ? "Build Credits" : "Action Credits";
  const subtitle =
    density === "popover"
      ? isBuild
        ? "For creating and editing"
        : "For live app actions"
      : isBuild
        ? "Discuss, create, build & edit apps"
        : "Runtime AI, email, images & automations";

  const bar = isBuild ? "bg-gradient-to-r from-violet-500 to-accent" : "bg-gradient-to-r from-cyan-500 to-teal-400";
  const iconColor = isBuild ? "text-violet-600" : "text-cyan-600";

  if (density === "mini") {
    const cap = displayedCap(bucket, kind, planId, isConfirmed);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Icon className={cn("size-3", iconColor)} strokeWidth={1.75} />
            {isBuild ? "Build" : "Action"}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-foreground">
            {formatCreditAmount(bucket.available)}
            <span className="font-normal text-muted-foreground/80"> left</span>
          </span>
        </div>
        <div className="h-0.5 overflow-hidden rounded-full bg-muted/80">
          <div className={cn("h-full rounded-full transition-all duration-700 ease-out", bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  const isPopover = density === "popover";

  if (isPopover) {
    const display = formatCreditBucketDisplay(bucket, kind, planId ?? "free", Boolean(isConfirmed));
    return (
      <div
        className={cn(
          "relative flex min-h-[68px] flex-col items-center justify-center rounded-lg px-2 py-2 text-center ring-1",
          isBuild
            ? "bg-gradient-to-br from-violet-500/[0.12] via-violet-400/[0.06] to-indigo-500/[0.04] ring-violet-500/20"
            : "bg-gradient-to-br from-cyan-500/[0.12] via-teal-400/[0.06] to-sky-500/[0.04] ring-cyan-500/20",
        )}
      >
        <div className="flex items-center justify-center gap-1.5">
          <Icon className={cn("size-3.5", iconColor)} strokeWidth={2} />
          <p className="text-[10px] font-semibold tracking-wide text-foreground">{title}</p>
        </div>
        <p className="mt-1 text-[16px] font-bold tabular-nums leading-none text-foreground">
          {display.displayText}
        </p>
        {display.secondaryText ? (
          <p className="mt-0.5 text-[10px] font-medium text-violet-500 dark:text-violet-400">
            {display.secondaryText}
          </p>
        ) : null}
        <div
          className={cn(
            "mt-1.5 h-1.5 w-full max-w-[148px] overflow-hidden rounded-full",
            isBuild ? "bg-violet-500/15" : "bg-cyan-500/15",
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isBuild
                ? "bg-gradient-to-r from-violet-600 via-violet-500 to-accent shadow-[0_0_6px_rgba(139,92,246,0.28)]"
                : "bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-400 shadow-[0_0_6px_rgba(6,182,212,0.28)]",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  const rowShell = density === "compact"
      ? cn(
          "rounded-lg p-2 ring-1",
          isBuild
            ? "bg-gradient-to-br from-violet-500/[0.08] to-accent/[0.04] ring-violet-500/15"
            : "bg-gradient-to-br from-cyan-500/[0.08] to-teal-400/[0.04] ring-cyan-500/15",
        )
      : null;

  const trackBg = isBuild ? "bg-violet-500/12" : "bg-cyan-500/12";

  const barFill = isBuild
    ? "bg-gradient-to-r from-violet-600 via-violet-500 to-accent"
    : "bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-400";

  const iconShell = isBuild
    ? "bg-violet-500/12 ring-violet-500/25"
    : "bg-cyan-500/12 ring-cyan-500/25";

  const bucketDisplay = formatCreditBucketDisplay(bucket, kind, planId ?? "free", Boolean(isConfirmed));

  const rowContent = (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
          iconShell,
        )}
      >
        <Icon className={cn("size-4", iconColor)} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <p className="text-[12px] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
              {state === "low" && (
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500/90" title="Low balance" />
              )}
              {bucket.bonusActive > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[9px] font-semibold ring-1",
                    isBuild ? "bg-violet-500/10 text-violet-700 ring-violet-500/15" : "bg-cyan-500/10 text-cyan-700 ring-cyan-500/15",
                  )}
                >
                  +{formatCreditAmount(bucket.bonusActive)}
                </span>
              )}
            </div>
            {!isPopover ? (
              <p className={cn("leading-tight text-muted-foreground", "text-[10.5px]")}>{subtitle}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "font-semibold tabular-nums leading-none text-foreground",
                isPopover ? "text-[15px]" : "text-xl",
              )}
            >
              {bucketDisplay.displayText}
            </p>
            {bucketDisplay.secondaryText ? (
              <p className={cn("mt-0.5 font-medium text-violet-500 dark:text-violet-400", isPopover ? "text-[9px]" : "text-[10px]")}>
                {bucketDisplay.secondaryText}
              </p>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "overflow-hidden rounded-full",
            trackBg,
            isPopover ? "mt-1.5 h-2" : "mt-2 h-1.5",
          )}
        >
          <motion.div
            className={cn("h-full rounded-full", barFill, state === "low" && "from-amber-500 to-orange-400 shadow-none")}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
    </div>
  );

  if (rowShell) {
    return <div className={rowShell}>{rowContent}</div>;
  }

  return (
    <div className="min-h-[64px]">
      {rowContent}
    </div>
  );
}

type UnifiedCreditsCardProps = {
  build: CanonicalCreditBucket;
  action: CanonicalCreditBucket;
  density: "popover" | "compact";
  planId: string;
  isConfirmed?: boolean;
};

function UnifiedCreditsCard({ build, action, density, planId, isConfirmed }: UnifiedCreditsCardProps) {
  const isPopover = density === "popover";
  const reset = formatResetDate(build.resetDate ?? action.resetDate);

  return (
    <div className={cn(isPopover ? "space-y-1" : "space-y-1.5")}>
      <CreditRow kind="build" bucket={build} density={density} planId={planId} isConfirmed={isConfirmed} />
      <CreditRow kind="action" bucket={action} density={density} planId={planId} isConfirmed={isConfirmed} />
      {reset && (
        <p className="flex items-center gap-1 px-0.5 pt-0.5 text-[8.5px] leading-snug text-muted-foreground/70">
          <CalendarClock className="size-2.5 shrink-0" strokeWidth={1.5} />
          {reset}
        </p>
      )}
    </div>
  );
}

type FullBucketCardProps = {
  kind: "build" | "action";
  bucket: CanonicalCreditBucket;
  planId: string;
};

function FullBucketCard({ kind, bucket, planId }: FullBucketCardProps) {
  const state = bucketState(bucket);
  const pct = progressPct(bucket);
  const reset = formatResetDate(bucket.resetDate);
  const isBuild = kind === "build";
  const Icon = isBuild ? Zap : Activity;
  const title = isBuild ? "Build Credits" : "Action Credits";
  const subtitle = isBuild
    ? "Discuss, create, build & edit apps"
    : "Runtime AI, email, images & automations";

  const accent = isBuild
    ? "from-violet-500/15 via-accent/10 to-transparent ring-accent/20"
    : "from-cyan-500/12 via-teal-500/8 to-transparent ring-cyan-500/20";
  const bar = isBuild ? "bg-gradient-to-r from-violet-500 to-accent" : "bg-gradient-to-r from-cyan-500 to-teal-400";
  const iconColor = isBuild ? "text-accent" : "text-cyan-600";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br p-3.5 ring-1",
        accent,
        state === "low" && "ring-amber-500/25",
        state === "empty" && "opacity-90",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className={cn("size-3.5 shrink-0", iconColor)} strokeWidth={1.75} />
            <p className="text-[12px] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
        {bucket.bonusActive > 0 && (
          <span className="shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/15">
            +{formatCreditAmount(bucket.bonusActive)}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {formatCreditAmount(bucket.available)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            of {formatCreditAmount(bucket.planAllowance)} monthly
            {bucket.bonusActive > 0 ? (
              <span className="text-accent"> · +{formatCreditAmount(bucket.bonusActive)} bonus</span>
            ) : null}
          </p>
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          <p>{planLabel(planId)} plan</p>
          {bucket.usedThisPeriod > 0 ? (
            <p className="mt-0.5">{formatCreditAmount(bucket.usedThisPeriod)} used</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-background/50">
        <motion.div
          className={cn("h-full rounded-full", bar, state === "low" && "from-amber-500 to-orange-400")}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {reset && (
        <p className="mt-2 flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
          <CalendarClock className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          {reset}
        </p>
      )}
    </div>
  );
}

export type CreditsTrackerProps = {
  build: CanonicalCreditBucket;
  action: CanonicalCreditBucket;
  planId: string;
  loading?: boolean;
  error?: string | null;
  isConfirmed?: boolean;
  variant?: CreditsTrackerVariant;
  onRetry?: () => void;
  showUpgrade?: boolean;
  className?: string;
};

export function CreditsTracker({
  build,
  action,
  planId,
  loading,
  error,
  isConfirmed,
  variant = "full",
  onRetry,
  showUpgrade,
  className,
}: CreditsTrackerProps) {
  const isMini = variant === "mini";
  const isPopover = variant === "popover";
  const isCompact = variant === "compact";
  const isFull = variant === "full";

  if (loading || !isConfirmed) {
    return (
      <div className={cn(className)} data-testid="credits-loading">
        {isPopover || isCompact ? (
          <p className="py-2 text-center text-[11px] text-muted-foreground">Loading credits…</p>
        ) : null}
        <Skeleton className={cn("w-full rounded-lg", isPopover ? "h-[148px]" : isMini ? "h-14" : "h-28")} />
        {isFull && <Skeleton className="mt-2.5 h-28 w-full rounded-2xl" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center", className)}>
        <p className="text-[11px] text-muted-foreground">Could not load credits</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  const lowBalance =
    build.available < build.planAllowance * 0.2 || action.available < action.planAllowance * 0.2;

  if (isMini) {
    return (
      <div className={cn("space-y-2.5", className)}>
        <CreditRow kind="build" bucket={build} density="mini" planId={planId} isConfirmed={isConfirmed} />
        <CreditRow kind="action" bucket={action} density="mini" planId={planId} isConfirmed={isConfirmed} />
      </div>
    );
  }

  if (isPopover || isCompact) {
    return (
      <div className={cn(className)}>
        <UnifiedCreditsCard
          build={build}
          action={action}
          density={isPopover ? "popover" : "compact"}
          planId={planId}
          isConfirmed={isConfirmed}
        />
        {showUpgrade && lowBalance && !isPopover && (
          <Link
            href="/pricing"
            className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-accent/90"
          >
            <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            Upgrade for more credits
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      <FullBucketCard kind="build" bucket={build} planId={planId} />
      <FullBucketCard kind="action" bucket={action} planId={planId} />
      {showUpgrade && lowBalance && (
        <Link
          href="/pricing"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-accent/90"
        >
          <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
          Upgrade for more credits
        </Link>
      )}
    </div>
  );
}

export function CreditsOverviewHeader({ label = "Credits overview" }: { label?: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
      {label}
    </p>
  );
}
