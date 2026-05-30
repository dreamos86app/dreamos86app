"use client";

import * as React from "react";
import { Loader2, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type {
  OnboardingInsightsPayload,
  OnboardingSurveySegment,
} from "@/lib/admin/onboarding-insights";

function DonutChart({
  title,
  segments,
  total,
}: {
  title: string;
  segments: OnboardingSurveySegment[];
  total: number;
}) {
  if (segments.length === 0) {
    return (
      <div className="rounded-xl bg-background p-5 ring-1 ring-border">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="mt-4 text-[12px] text-muted-foreground">No responses yet.</p>
      </div>
    );
  }

  let cumulative = 0;
  const stops = segments.map((s) => {
    const start = (cumulative / total) * 100;
    cumulative += s.count;
    const end = (cumulative / total) * 100;
    return `${s.color} ${start}% ${end}%`;
  });

  return (
    <div className="rounded-xl bg-background p-5 ring-1 ring-border">
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{total} completed signups</p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          className="relative size-40 shrink-0 rounded-full shadow-inner ring-1 ring-border"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
          role="img"
          aria-label={`${title} distribution`}
        >
          <div className="absolute inset-[22%] flex items-center justify-center rounded-full bg-background text-center ring-1 ring-border">
            <span className="text-[18px] font-semibold tabular-nums text-foreground">{total}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-[12px]">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{s.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {s.count} · {s.percent}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AdminOnboardingInsightsPanel() {
  const [data, setData] = React.useState<OnboardingInsightsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedUser, setExpandedUser] = React.useState<string | null>(null);

  const load = React.useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/onboarding-insights?limit=25&offset=${offset}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as OnboardingInsightsPayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData((prev) =>
        append && prev
          ? {
              ...body,
              users: [...prev.users, ...body.users],
            }
          : body,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  React.useEffect(() => {
    void load(0, false);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-destructive/10 p-4 text-[13px] text-destructive ring-1 ring-destructive/20">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const total = data.totalCompleted || 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <DonutChart title="How did you hear about us?" segments={data.hearAbout} total={total} />
        <DonutChart title="What they want to build first" segments={data.buildGoals} total={total} />
        <DonutChart title="Experience level" segments={data.experienceLevels} total={total} />
      </div>

      <div className="rounded-xl bg-background ring-1 ring-border">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-[13px] font-semibold text-foreground">Onboarding responses</h3>
          <p className="text-[11px] text-muted-foreground">
            Showing {data.users.length} of {data.totalCompleted} users
          </p>
        </div>
        <ul className="divide-y divide-border">
          {data.users.map((u) => {
            const open = expandedUser === u.userId;
            return (
              <li key={u.userId} className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedUser(open ? null : u.userId)}
                  className="flex w-full cursor-pointer items-center gap-3 text-left"
                >
                  <Avatar
                    name={u.displayName ?? u.email ?? "User"}
                    src={null}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">
                      {u.displayName ?? u.email ?? u.userId}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {u.hearAbout ?? "—"}
                      {u.promoCode ? ` · Promo: ${u.promoCode}` : ""}
                      {u.completedAt
                        ? ` · ${new Date(u.completedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="mt-3 space-y-2 rounded-lg bg-muted/30 p-3 text-[11.5px] text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Email:</span> {u.email ?? "—"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Heard about us:</span>{" "}
                      {u.hearAbout ?? "—"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Build goal:</span>{" "}
                      {u.buildGoal ?? u.useCase ?? "—"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Promo / referral:</span>{" "}
                      {u.promoCode ?? "—"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Experience:</span>{" "}
                      {u.experienceLevel ?? "—"}
                    </p>
                    {Object.keys(u.answers).length > 0 && (
                      <pre className="max-h-40 overflow-auto rounded bg-background p-2 text-[10px] text-foreground ring-1 ring-border">
                        {JSON.stringify(u.answers, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {data.users.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-[13px] text-muted-foreground">
            <User className="size-5 opacity-50" />
            No completed onboarding records yet.
          </div>
        )}
        {data.hasMore && (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="secondary"
              size="sm"
              disabled={loadingMore}
              onClick={() => void load(data.offset + data.limit, true)}
            >
              {loadingMore ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
