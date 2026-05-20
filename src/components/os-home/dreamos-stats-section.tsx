"use client";

import * as React from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatCount, useCountUp } from "@/lib/hooks/use-count-up";

const STATS = [
  {
    value: 50_000,
    label: "projects launched on DreamOS86",
    display: (n: number) => n.toLocaleString(),
    suffix: "+",
  },
  {
    value: 1_000,
    label: "new projects started every day",
    display: (n: number) => n.toLocaleString(),
    suffix: "+",
  },
  {
    value: 1_000_000,
    label: "daily visits to apps built on the platform",
    display: (n: number) => (n >= 1_000_000 ? "1M" : formatCount(n)),
    suffix: "+",
  },
] as const;

function StatCard({
  target,
  label,
  display,
  suffix,
  active,
  className,
}: {
  target: number;
  label: string;
  display: (n: number) => string;
  suffix: string;
  active: boolean;
  className?: string;
}) {
  const count = useCountUp(target, active, 4000);
  const shown = display(active ? count : 0);
  const showSuffix = active && count >= target;

  return (
    <motion.div
      className={cn(
        "flex min-h-[168px] flex-col justify-between rounded-[1.35rem] border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-blue-50/90 p-6 shadow-[0_0_40px_-12px_rgba(59,130,246,0.35)] ring-1 ring-sky-100/80 dark:border-accent/25 dark:from-accent/10 dark:via-background dark:to-indigo-950/30 dark:shadow-[0_0_48px_-16px_hsl(var(--accent)/0.35)]",
        className,
      )}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="text-[clamp(2.25rem,5vw,3.25rem)] font-semibold tabular-nums leading-none tracking-[-0.04em] text-foreground">
        {shown}
        {showSuffix ? suffix : ""}
      </p>
      <p className="max-w-[14rem] text-[13px] leading-snug text-muted-foreground">{label}</p>
    </motion.div>
  );
}

export function DreamOsStatsSection() {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="relative w-full overflow-hidden rounded-[1.75rem] px-5 py-10 sm:px-8 sm:py-12"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100 via-white to-blue-50 dark:from-accent/15 dark:via-background dark:to-indigo-950/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(ellipse_80%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_65%)]"
        aria-hidden
      />
      <div className="relative">
      <motion.div
        className="mb-8 flex flex-col items-center gap-3 text-center"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/25">
          New
        </span>
        <h2 className="text-balance text-[clamp(1.5rem,3.5vw,2rem)] font-semibold tracking-[-0.03em] text-foreground">
          DreamOS86 in numbers
        </h2>
        <p className="max-w-lg text-pretty text-[14px] text-muted-foreground">
          Builders are shipping real apps every day — here is the momentum so far.
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        variants={{ show: { transition: { staggerChildren: 0.12 } } }}
      >
        {STATS.map((s) => (
          <StatCard
            key={s.label}
            target={s.value}
            label={s.label}
            display={s.display}
            suffix={s.suffix}
            active={inView}
          />
        ))}
      </motion.div>
      </div>
    </section>
  );
}
