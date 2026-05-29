"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, Shield, Zap, X } from "lucide-react";
import { IntegrationShowcaseSection } from "@/components/marketing/integrations-showcase";
import {
  PublicMarketingFooter,
  PublicMarketingHeader,
} from "@/components/marketing/public-marketing-shell";
import { PublicSignupSection } from "@/components/marketing/public-signup-section";
import { PublicConversionCards } from "@/components/marketing/public-conversion-cards";
import { HowItWorksDemo } from "@/components/marketing/how-it-works-demo";
import { PublicPricingSection } from "@/components/marketing/public-pricing-section";
import { DreamOsStatsSection } from "@/components/os-home/dreamos-stats-section";
import { WhyDreamOsSection } from "@/components/os-home/why-dreamos-section";
import { PublicLandingSecondaryCtas } from "@/components/marketing/public-landing-sections";
import { cn } from "@/lib/utils";

function PublicAuthModal({
  open,
  onClose,
  draft,
  onDraftChange,
}: {
  open: boolean;
  onClose: () => void;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  const nextCreate =
    draft.trim().length > 0
      ? `/create?prompt=${encodeURIComponent(draft.trim())}&mode=build&autostart=1`
      : "/create?mode=build&autostart=1";
  const signupHref = `/auth/signup?next=${encodeURIComponent(nextCreate)}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(nextCreate)}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10040] flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-md sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background p-5 shadow-2xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
            <p className="pr-10 text-[15px] font-semibold text-foreground">Sign in to build</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Save projects, preview live, and publish — unlock the full create workflow after sign in.
            </p>
            <label
              htmlFor="auth-gate-prompt"
              className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Your idea (optional)
            </label>
            <textarea
              id="auth-gate-prompt"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              rows={3}
              placeholder="e.g. A calm habit tracker with streaks and charts…"
              className="mt-1.5 w-full resize-none rounded-xl border border-border/80 bg-surface/60 px-3 py-2 text-[13px] text-foreground outline-none transition focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-inset"
            />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Link
                href={loginHref}
                data-testid="public-auth-login"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 text-[13px] font-semibold text-foreground transition hover:bg-surface/80"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                data-testid="public-auth-signup"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white transition hover:bg-accent/90"
              >
                Get Started
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PublicLanding() {
  const [draft, setDraft] = React.useState("");
  const [authOpen, setAuthOpen] = React.useState(false);

  return (
    <div
      data-testid="public-landing"
      className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden"
    >
      <PublicAuthModal open={authOpen} onClose={() => setAuthOpen(false)} draft={draft} onDraftChange={setDraft} />

      <PublicMarketingHeader />

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--accent)/0.22),transparent_70%)]"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="size-3.5" strokeWidth={2} /> AI-native app OS
          </p>
          <h1 className="mt-5 text-balance text-[28px] font-semibold tracking-tight text-foreground sm:text-[42px]">
            Turn ideas into apps you can preview, polish, and launch.
          </h1>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
            Describe what you want in plain language. Watch it build, preview the result, and publish when it&apos;s ready.
          </p>

          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/[0.08] to-background p-1 shadow-[0_24px_64px_-28px_rgba(30,107,255,0.35)] ring-1 ring-border/80">
            <div className="rounded-[14px] bg-background/95 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="w-full cursor-pointer text-left"
              >
                <label htmlFor="public-hero-prompt-ro" className="sr-only">
                  Describe what you want to build
                </label>
                <div
                  id="public-hero-prompt-ro"
                  className="w-full rounded-xl border border-border/70 bg-surface/60 px-3 py-2.5 text-left text-[13px] leading-relaxed text-muted-foreground ring-0 transition hover:border-accent/30"
                >
                  {draft.trim()
                    ? draft
                    : "Create me a management food inventory app for my restaurant…"}
                </div>
              </button>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  data-testid="public-hero-continue"
                  onClick={() => setAuthOpen(true)}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold shadow-sm transition",
                    "bg-accent text-white hover:bg-accent/90",
                  )}
                >
                  <Zap className="size-3.5" strokeWidth={2} />
                  Get Started free
                  <ArrowRight className="size-3.5 opacity-80" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          <PublicLandingSecondaryCtas onStart={() => setAuthOpen(true)} />

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="size-3.5 text-accent" strokeWidth={1.75} /> Cancel anytime — only pay for completed work
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-3.5 text-accent" strokeWidth={1.75} /> Real preview & publish states
            </span>
          </div>
        </motion.section>

        <PublicConversionCards />
        <HowItWorksDemo />

        <PublicPricingSection />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
          className="mx-auto mt-20 max-w-5xl"
        >
          <IntegrationShowcaseSection variant="premium" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
          className="mx-auto mt-16 max-w-5xl px-4 sm:px-6"
        >
          <WhyDreamOsSection />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
          className="mx-auto mt-16 max-w-5xl"
        >
          <DreamOsStatsSection />
        </motion.div>

        <PublicSignupSection />
      </main>

      <PublicMarketingFooter />
    </div>
  );
}
