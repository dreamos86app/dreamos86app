"use client";

import * as React from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Check,
  Share2,
  Sparkles,
  Trophy,
  Users,
  Gift,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferralRow {
  id: string;
  name: string;
  joined: string;
  status: "rewarded";
  creditsGranted: number;
}

interface ReferralResponse {
  code: string;
  inviteUrl: string;
  slotsUsed: number;
  slotsRemaining: number;
  maxReferrals: number;
  creditsPerReferral: number;
  stats: {
    total: number;
    rewarded: number;
    creditsEarned: number;
  };
  referrals: ReferralRow[];
  referredBy: string | null;
}

const fetcher = async (url: string): Promise<ReferralResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ─── Animated counter ────────────────────────────────────────────────────────

function AnimatedCounter({ value, duration = 0.6 }: { value: number; duration?: number }) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    const start = display;
    const delta = value - start;
    if (delta === 0) return;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  hint?: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30" style={{ color: accent }} />
      <div className="flex items-center justify-between">
        <div className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1a`, color: accent }}>
          <Icon className="size-4" strokeWidth={1.75} />
        </div>
      </div>
      <p className="mt-3 text-[24px] font-semibold tracking-tight tabular-nums text-foreground">
        <AnimatedCounter value={value} />
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}


// ─── Main dashboard ──────────────────────────────────────────────────────────

export function ReferralsDashboard() {
  const { data, error, isLoading, mutate } = useSWR<ReferralResponse>(
    "/api/referrals",
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 30_000 },
  );

  const [copied, setCopied] = React.useState(false);
  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function nativeShare() {
    if (!data) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "DreamOS86",
          text: "Build apps with an AI-native operating system. Join me on DreamOS86.",
          url: data.inviteUrl,
        });
      } catch {}
    } else {
      copyLink();
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-destructive/10 p-4 text-[13px] text-destructive ring-1 ring-destructive/20">
        Couldn’t load your referral data. Try refreshing.
      </div>
    );
  }

  const milestones = [
    { count: 1, label: "First friend", reward: `+${data.creditsPerReferral} credits` },
    { count: 2, label: "Two signups", reward: `+${data.creditsPerReferral * 2} credits total` },
    { count: 3, label: "Three friends", reward: `+${data.creditsPerReferral * 3} credits total` },
    { count: 5, label: "Max referrals", reward: `+${data.creditsPerReferral * 5} credits total` },
  ];
  const nextMilestone =
    milestones.find((m) => data.stats.rewarded < m.count) ?? milestones[milestones.length - 1];
  const progressPct = Math.min(100, (data.stats.rewarded / data.maxReferrals) * 100);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-violet-500/15 p-6 ring-1 ring-border"
      >
        <div className="absolute -top-16 -right-16 size-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 size-56 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            Referral program
          </div>
          <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-foreground">
            Earn credits for every friend you bring.
          </h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            Invite friends with your unique link. When they join, both of you receive {data.creditsPerReferral} credits — automatically. Up to {data.maxReferrals} invites, {data.slotsRemaining} remaining.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-1 rounded-xl bg-background p-1 ring-1 ring-border">
              <div className="flex flex-1 items-center gap-2 px-3 py-1.5">
                <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
                  Code
                </span>
                <span className="font-mono text-[14px] font-semibold tracking-wider text-foreground">
                  {data.code}
                </span>
                <span className="ml-2 truncate text-[11.5px] text-muted-foreground">
                  {data.inviteUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className={cn(
                  "flex h-10 min-w-[5.5rem] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold ring-2 ring-transparent transition focus-visible:outline-none focus-visible:ring-ring",
                  copied
                    ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25"
                    : "bg-surface text-foreground hover:bg-surface-raised active:scale-[0.98]",
                )}
              >
                {copied ? <Check className="size-3.5" strokeWidth={2.25} /> : <Copy className="size-3.5" strokeWidth={2.25} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={nativeShare}
              className="flex h-11 min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(30,107,255,0.45)] ring-2 ring-accent/30 transition hover:bg-accent/90 hover:ring-accent/50 active:scale-[0.98] sm:shrink-0"
            >
              <Share2 className="size-4" strokeWidth={2} />
              Share
            </button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Friends invited" value={data.slotsUsed} accent="#1e6bff" hint={`${data.slotsRemaining} slots left`} />
        <StatCard icon={Trophy} label="Rewarded" value={data.stats.rewarded} accent="#10b981" />
        <StatCard
          icon={TrendingUp}
          label="Credits earned"
          value={data.stats.creditsEarned}
          accent="#7c3aed"
          hint="From referrals"
        />
        <StatCard
          icon={Gift}
          label="Per referral"
          value={data.creditsPerReferral}
          accent="#f59e0b"
          hint="Credits each"
        />
      </div>

      {/* Milestone progression */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
              Next milestone: {nextMilestone.label}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              <span className="font-semibold text-accent">{data.stats.rewarded}</span> /{" "}
              <span>{nextMilestone.count}</span> friends qualified · unlocks {nextMilestone.reward}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Gift className="size-4" strokeWidth={1.75} />
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {milestones.map((m) => {
            const reached = data.stats.rewarded >= m.count;
            return (
              <div
                key={m.count}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-[11px] ring-1",
                  reached
                    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30"
                    : "bg-surface text-muted-foreground ring-border",
                )}
              >
                <span className="font-semibold tabular-nums">{m.count}</span> · {m.reward}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Activity feed */}
      <div className="rounded-[var(--radius-xl)] bg-background ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            Recent activity
          </h3>
          <button
            onClick={() => mutate()}
            className="text-[11.5px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            Refresh
          </button>
        </div>

        {data.referrals.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent/10">
              <Users className="size-5 text-accent" strokeWidth={1.5} />
            </div>
            <p className="text-[13px] font-medium text-foreground">
              No referrals yet
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Share your link to start earning credits.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {data.referrals.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-indigo-500/20 text-[10.5px] font-semibold text-foreground">
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">
                      {r.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Joined {new Date(r.joined).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600">
                    +{r.creditsGranted} credits
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
