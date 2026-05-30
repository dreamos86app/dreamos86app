"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, BarChart2, Clock, Cpu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CreditsOverviewHeader, CreditsTracker } from "@/components/credits/credits-tracker";
import { refreshCredits, useCreditsStore } from "@/lib/stores/credits-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/supabase/client";
import type { CreditEvent } from "@/lib/supabase/types";

const MODEL_COLORS: Record<string, string> = {
  "claude-3-5-sonnet": "bg-violet-500",
  "claude-3-5-haiku": "bg-indigo-500",
  "gpt-4o": "bg-emerald-500",
  "gpt-4o-mini": "bg-cyan-500",
  "gemini-2-0-flash": "bg-blue-500",
  "system": "bg-muted-foreground",
};

function getModelColor(modelId: string) {
  return MODEL_COLORS[modelId] ?? "bg-accent";
}

export function CreditsView() {
  const { build, action, planId, loading: creditsLoading, error: creditsError, isConfirmed } = useCreditsStore();
  const { profile } = useAuthStore();
  const supabase = createClient();

  const [recentEvents, setRecentEvents] = React.useState<CreditEvent[]>([]);
  const [modelUsage, setModelUsage] = React.useState<Record<string, number>>({});
  const [eventsLoading, setEventsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!profile?.id) { setEventsLoading(false); return; }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from("credit_events")
      .select("*")
      .eq("user_id", profile.id)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!error) {
          const events = (data as CreditEvent[]) ?? [];
          setRecentEvents(events);
          const breakdown: Record<string, number> = {};
          for (const ev of events) {
            if (ev.event_type === "generation") {
              breakdown[ev.model_id] = (breakdown[ev.model_id] ?? 0) + ev.credits_consumed;
            }
          }
          setModelUsage(breakdown);
        }
        setEventsLoading(false);
      });
  }, [profile?.id]);

  const planCredits = build.planAllowance + build.bonusActive;
  const usagePct = planCredits > 0 ? Math.min((build.usedThisPeriod / planCredits) * 100, 100) : 0;
  const daysUntilReset = build.resetDate
    ? Math.max(0, Math.ceil((new Date(build.resetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const topModels = Object.entries(modelUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  const totalModelCredits = topModels.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <motion.div
      variants={variants.staggerContainer}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-3xl space-y-6 pb-10"
    >
      {/* Credits overview */}
      <motion.div variants={variants.fadeUp} className="space-y-3">
        <CreditsOverviewHeader />
        <CreditsTracker
          build={build}
          action={action}
          planId={planId}
          loading={creditsLoading || !isConfirmed}
          error={creditsError}
          variant="full"
          showUpgrade={(profile?.plan_id ?? planId) === "free" || build.available < build.planAllowance * 0.15}
          onRetry={() => void refreshCredits({ reason: "manual", force: true })}
        />
      </motion.div>

      {/* Build usage detail (legacy ledger) */}
      <motion.div variants={variants.fadeUp} className="rounded-[var(--radius-2xl)] bg-surface p-5 ring-1 ring-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <span className="text-[12px] font-medium text-muted-foreground">Build usage this period</span>
            </div>
            {creditsLoading ? (
              <div className="h-10 flex items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <p className="text-[28px] font-semibold tracking-tight text-foreground tabular-nums">
                {build.usedThisPeriod.toLocaleString()}
                <span className="ml-1.5 text-[14px] font-normal text-muted-foreground">
                  / {planCredits.toLocaleString()} allowance
                </span>
              </p>
            )}
            {daysUntilReset !== null && (
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                Resets in {daysUntilReset} day{daysUntilReset !== 1 ? "s" : ""}
                {build.resetDate && (
                  <span className="text-muted-foreground/60">
                    · {new Date(build.resetDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {(profile?.plan_id ?? planId) === "free" && (
            <Button variant="accent" size="sm" asChild>
              <Link href="/pricing">
                Upgrade plan <ArrowRight className="ml-1.5 size-3.5" strokeWidth={2} />
              </Link>
            </Button>
          )}
        </div>

        {planCredits > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-muted-foreground">Used this period</span>
              <span className="text-[12px] font-medium tabular-nums text-foreground">
                {build.usedThisPeriod.toLocaleString()} / {planCredits.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-accent/15">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  usagePct > 90 ? "bg-destructive" : usagePct > 75 ? "bg-amber-500" : "bg-accent",
                )}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(usagePct)}% used</p>
          </div>
        )}
      </motion.div>

      {/* Plan info */}
      <motion.div variants={variants.fadeUp} className="flex items-center justify-between rounded-[var(--radius-xl)] bg-surface px-5 py-4 ring-1 ring-border">
        <div>
          <p className="text-[13px] font-semibold text-foreground capitalize">
            {profile?.plan_id ?? "free"} plan
          </p>
          <p className="text-[12px] text-muted-foreground">
            {(profile?.plan_interval ?? "monthly") === "yearly"
              ? "Billed annually"
              : "Billed monthly"}
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/pricing">Change plan</Link>
        </Button>
      </motion.div>

      {/* Model usage breakdown */}
      {topModels.length > 0 && (
        <motion.div variants={variants.fadeUp} className="rounded-[var(--radius-xl)] bg-surface p-5 ring-1 ring-border">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="text-[14px] font-semibold text-foreground">Credits by model</h3>
            <span className="ml-auto text-[11px] text-muted-foreground">Last 30 days</span>
          </div>
          <div className="space-y-3">
            {topModels.map(([model, credits]) => (
              <div key={model}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] font-medium text-foreground">{model}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {credits.toLocaleString()} <span className="opacity-60">({Math.round((credits / totalModelCredits) * 100)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", getModelColor(model))}
                    style={{ width: `${(credits / totalModelCredits) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent activity */}
      <motion.div variants={variants.fadeUp} className="rounded-[var(--radius-xl)] bg-surface ring-1 ring-border">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <BarChart2 className="size-4 text-muted-foreground" strokeWidth={1.75} />
          <h3 className="text-[14px] font-semibold text-foreground">Recent activity</h3>
          <span className="ml-auto text-[11px] text-muted-foreground">Last 20 events</span>
        </div>

        {eventsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Zap className="mb-2 size-8 text-muted-foreground/20" strokeWidth={1.25} />
            <p className="text-[13px] text-muted-foreground">No activity yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              Start using AI Chat or build an app to see usage here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-4 px-5 py-3">
                <div className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  ev.event_type === "grant" ? "bg-positive/10" : "bg-accent/10",
                )}>
                  <Zap
                    className={cn("size-3.5", ev.event_type === "grant" ? "text-positive" : "text-accent")}
                    strokeWidth={1.75}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-foreground capitalize">
                    {ev.event_type} · {ev.model_id}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(ev.created_at).toLocaleDateString()} · {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={cn(
                  "shrink-0 text-[13px] font-semibold tabular-nums",
                  ev.event_type === "grant" ? "text-positive" : "text-foreground",
                )}>
                  {ev.event_type === "grant" ? "+" : "-"}{Math.abs(ev.credits_consumed)}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* No top-up packs — subscription only */}
      <motion.div variants={variants.fadeUp} className="rounded-[var(--radius-xl)] bg-surface px-5 py-4 ring-1 ring-border">
        <p className="text-[13px] font-semibold text-foreground">Need more credits?</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Upgrade your subscription to get more credits each month. Credits reset automatically — no one-time packs.
        </p>
        <Button variant="accent" size="sm" asChild className="mt-3">
          <Link href="/pricing">
            Upgrade plan <ArrowRight className="ml-1.5 size-3.5" strokeWidth={2} />
          </Link>
        </Button>
      </motion.div>
    </motion.div>
  );
}
