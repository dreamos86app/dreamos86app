"use client";

import * as React from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
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
import { refreshCredits } from "@/lib/stores/credits-store";

type ReferralStatus = "pending" | "rewarded" | "capped" | "blocked" | "invalid";

interface ReferralRow {
  id: string;
  name: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  joined: string;
  status: ReferralStatus;
  creditsGranted: number;
  rewardedAt?: string | null;
}

interface ReferredByProfile {
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  referralCode: string;
  bonusReceived: boolean;
  appliedAt: string | null;
}

interface ReferralResponse {
  code: string;
  inviteUrl: string;
  slotsUsed: number;
  slotsRemaining: number;
  maxReferrals: number;
  creditsPerReferral: number;
  maxReached?: boolean;
  stats: {
    total: number;
    rewarded: number;
    creditsEarned: number;
  };
  referrals: ReferralRow[];
  referredBy: string | null;
  referredByProfile: ReferredByProfile | null;
}

const fetcher = async (url: string): Promise<ReferralResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

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
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30"
        style={{ color: accent }}
      />
      <div className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1a`, color: accent }}>
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-[24px] font-semibold tracking-tight tabular-nums text-foreground">
        <AnimatedCounter value={value} />
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}

function UserAvatar({
  name,
  email,
  avatarUrl,
  size = 32,
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  size?: number;
}) {
  const initials = (name || email || "U").slice(0, 2).toUpperCase();
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-1 ring-border"
        unoptimized
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-indigo-500/20 text-[10.5px] font-semibold text-foreground ring-1 ring-border"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function statusLabel(status: ReferralStatus): string {
  switch (status) {
    case "rewarded":
      return "Rewarded";
    case "capped":
      return "Capped";
    case "pending":
      return "Joined";
    case "blocked":
      return "Blocked";
    default:
      return "Invalid";
  }
}

function statusClass(status: ReferralStatus): string {
  switch (status) {
    case "rewarded":
      return "bg-emerald-500/10 text-emerald-600";
    case "capped":
      return "bg-amber-500/10 text-amber-700";
    case "pending":
      return "bg-blue-500/10 text-blue-600";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function ReferralsDashboard() {
  const { data, error, isLoading, mutate } = useSWR<ReferralResponse>(
    "/api/referrals",
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 0 },
  );

  React.useEffect(() => {
    if (data) void refreshCredits();
  }, [data?.stats.rewarded, data?.stats.creditsEarned]);

  const [copied, setCopied] = React.useState(false);
  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function nativeShare() {
    if (!data) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "DreamOS86",
          text: "Build apps with DreamOS86 — we both get 5 Build Credits when you join.",
          url: data.inviteUrl,
        });
      } catch {
        /* ignore */
      }
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

  const milestones = [1, 2, 3, 4, 5].map((count) => ({
    count,
    label: `${count} friend${count > 1 ? "s" : ""}`,
    reward: `+${data.creditsPerReferral * count} Build Credits total`,
  }));
  const nextMilestone =
    milestones.find((m) => data.stats.rewarded < m.count) ?? milestones[milestones.length - 1];
  const progressPct = Math.min(100, (data.stats.rewarded / data.maxReferrals) * 100);
  const referredBy = data.referredByProfile;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {referredBy && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-[var(--radius-xl)] bg-surface/80 px-4 py-3 ring-1 ring-border"
        >
          <UserAvatar
            name={referredBy.displayName ?? referredBy.email ?? "Referrer"}
            email={referredBy.email}
            avatarUrl={referredBy.avatarUrl}
            size={36}
          />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="text-muted-foreground">Invited by</p>
            <p className="truncate font-medium text-foreground">
              {referredBy.displayName && (
                <span>{referredBy.displayName} · </span>
              )}
              {referredBy.email ? (
                <a href={`mailto:${referredBy.email}`} className="text-accent hover:underline">
                  {referredBy.email}
                </a>
              ) : (
                referredBy.referralCode
              )}
            </p>
            {referredBy.bonusReceived && (
              <p className="mt-0.5 text-[11px] text-emerald-600">
                +{data.creditsPerReferral} Build Credits welcome bonus received
                {referredBy.appliedAt
                  ? ` · ${new Date(referredBy.appliedAt).toLocaleDateString()}`
                  : ""}
              </p>
            )}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-violet-500/15 p-6 ring-1 ring-border"
      >
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            Referral program
          </div>
          <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-foreground">
            Earn Build Credits for every friend you bring.
          </h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            Share your link. When a new friend joins, you each get {data.creditsPerReferral} Build Credits — up to{" "}
            {data.maxReferrals} friends ({data.maxReferrals * data.creditsPerReferral} Build Credits max).
            {data.maxReached ? " You’ve reached the referral cap." : ` ${data.slotsRemaining} slots left.`}
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-1 rounded-xl bg-background p-1 ring-1 ring-border">
              <div className="flex flex-1 items-center gap-2 px-3 py-1.5">
                <span className="font-mono text-[14px] font-semibold tracking-wider text-foreground">
                  {data.code}
                </span>
                <span className="ml-2 truncate text-[11.5px] text-muted-foreground">{data.inviteUrl}</span>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className={cn(
                  "flex h-10 min-w-[5.5rem] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold",
                  copied
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-surface text-foreground hover:bg-surface-raised",
                )}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={nativeShare}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-5 text-[12.5px] font-semibold text-white"
            >
              <Share2 className="size-4" />
              Share
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Users}
          label="Friends invited"
          value={data.slotsUsed}
          accent="#1e6bff"
          hint={`${data.stats.rewarded}/${data.maxReferrals} rewarded`}
        />
        <StatCard icon={Trophy} label="Rewarded" value={data.stats.rewarded} accent="#10b981" />
        <StatCard
          icon={TrendingUp}
          label="Build Credits earned"
          value={data.stats.creditsEarned}
          accent="#7c3aed"
          hint="From referrals"
        />
        <StatCard
          icon={Gift}
          label="Per referral"
          value={data.creditsPerReferral}
          accent="#f59e0b"
          hint="Build Credits each"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">
              {data.maxReached ? "Maximum referrals reached" : `Next milestone: ${nextMilestone.label}`}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              <span className="font-semibold text-accent">{data.stats.rewarded}</span> / {data.maxReferrals}{" "}
              rewarded · {nextMilestone.reward}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.7 }}
          />
        </div>
      </motion.div>

      <div className="rounded-[var(--radius-xl)] bg-background ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-[13px] font-semibold text-foreground">Recent activity</h3>
          <button
            type="button"
            onClick={() => mutate()}
            className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>

        {data.referrals.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="mx-auto mb-3 size-5 text-accent" />
            <p className="text-[13px] font-medium text-foreground">No referrals yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Share your link to start earning Build Credits.
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
                  <UserAvatar
                    name={r.displayName ?? r.name}
                    email={r.email}
                    avatarUrl={r.avatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">
                      {r.displayName ?? r.name}
                    </p>
                    {r.email && (
                      <p className="truncate text-[11px] text-muted-foreground">{r.email}</p>
                    )}
                    <p className="text-[10.5px] text-muted-foreground">
                      Joined {new Date(r.joined).toLocaleDateString()}
                      {r.rewardedAt
                        ? ` · Rewarded ${new Date(r.rewardedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        statusClass(r.status),
                      )}
                    >
                      {statusLabel(r.status)}
                    </span>
                    {r.creditsGranted > 0 && (
                      <span className="text-[10.5px] font-semibold text-emerald-600">
                        +{r.creditsGranted} Build Credits
                      </span>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
