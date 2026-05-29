"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, Zap } from "lucide-react";
import { PLAN_PRICE_USD, planPricingCardCopy } from "@/lib/billing/plan-credit-economics";
import { cn } from "@/lib/utils";

const PUBLIC_PLANS = [
  {
    id: "free",
    name: "Free",
    price: PLAN_PRICE_USD.free,
    highlight: false,
    badge: null as string | null,
    planKey: "free" as const,
    features: ["3 active projects", "Discuss mode", "Public deployments"],
  },
  {
    id: "starter",
    name: "Starter",
    price: PLAN_PRICE_USD.starter,
    highlight: false,
    badge: null,
    planKey: "starter" as const,
    features: ["Unlimited projects", "Edit & Build modes", "Custom domains"],
  },
  {
    id: "pro",
    name: "Pro",
    price: PLAN_PRICE_USD.pro,
    highlight: true,
    badge: "Most popular",
    planKey: "pro" as const,
    features: ["All frontier models", "5 collaborators", "API access"],
  },
  {
    id: "infinity",
    name: "Infinity",
    price: PLAN_PRICE_USD.infinity,
    highlight: false,
    badge: "Teams",
    planKey: "infinity" as const,
    features: ["Dedicated compute", "White-label", "SSO / SAML"],
  },
];

function PublicPlanCard({
  plan,
  index,
}: {
  plan: (typeof PUBLIC_PLANS)[number];
  index: number;
}) {
  const copy = planPricingCardCopy(plan.planKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.38, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] p-5 ring-1 transition-shadow",
        plan.highlight
          ? "bg-gradient-to-b from-accent/[0.12] via-background to-background ring-accent/35 shadow-[0_20px_50px_-24px_hsl(var(--accent)/0.45)]"
          : "bg-background/95 ring-border shadow-sm hover:shadow-md",
      )}
    >
      {plan.highlight && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
      )}
      {plan.badge && (
        <span
          className={cn(
            "absolute right-4 top-4 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
            plan.highlight ? "bg-accent text-white" : "bg-surface text-muted-foreground ring-1 ring-border",
          )}
        >
          {plan.badge}
        </span>
      )}

      <p className="text-[12px] font-semibold text-muted-foreground">{plan.name}</p>
      <div className="mt-1 flex items-end gap-1">
        {plan.price === 0 ? (
          <span className="text-[28px] font-bold tracking-tight text-foreground">Free</span>
        ) : (
          <>
            <span className="text-[28px] font-bold tracking-tight text-foreground">${plan.price}</span>
            <span className="pb-1 text-[12px] text-muted-foreground">/mo</span>
          </>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-accent/8 px-3 py-2 ring-1 ring-accent/15">
        <div className="flex items-center gap-1.5">
          <Zap className="size-3.5 shrink-0 text-accent" strokeWidth={2} />
          <span className="text-[11px] font-semibold text-accent">{copy.buildPill}</span>
        </div>
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12px] text-foreground/85">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10.5px] text-muted-foreground">
        {copy.actionCredits.toLocaleString()} Action Credits / mo
      </p>
    </motion.div>
  );
}

export function PublicPricingSection() {
  return (
    <section
      data-testid="public-pricing-section"
      className="mx-auto mt-20 max-w-5xl px-4 sm:px-0"
    >
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border/80 bg-gradient-to-br from-violet-500/[0.06] via-background to-blue-500/[0.08] p-6 ring-1 ring-border sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-accent/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-violet-500/10 blur-3xl"
        />

        <div className="relative text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <Sparkles className="size-3.5" strokeWidth={2} />
            Pricing
          </p>
          <h2 className="mt-2 text-balance text-[26px] font-semibold tracking-tight text-foreground sm:text-[32px]">
            Simple plans. Build Credits that scale with you.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            Start free with 30 Build Credits every month. Upgrade when you need more generation power,
            runtime AI, and production features — no surprise bills.
          </p>
        </div>

        <div className="relative mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {PUBLIC_PLANS.map((plan, i) => (
            <PublicPlanCard key={plan.id} plan={plan} index={i} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/pricing"
            data-testid="public-pricing-view-all"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[13px] font-semibold text-white shadow-[0_8px_28px_-8px_hsl(var(--accent)/0.55)] transition hover:bg-accent/90 active:scale-[0.98]"
          >
            View full pricing
            <ArrowRight className="size-4" strokeWidth={2} />
          </Link>
          <Link
            href="/auth/signup"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-6 text-[13px] font-semibold text-foreground ring-1 ring-border transition hover:border-accent/30 hover:bg-surface"
          >
            Get started free
          </Link>
        </motion.div>

        <p className="relative mt-4 text-center text-[11.5px] text-muted-foreground">
          Annual billing saves 20%. Cancel anytime — credits reset each billing period.
        </p>
      </div>
    </section>
  );
}
