"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Check, X, ChevronDown, ChevronUp, Zap, Sparkles, Activity,
  Building2, ArrowRight, MessageCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import { variants } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { BUILD_CREDIT_HINTS, CREDIT_PACKAGE_EXAMPLES, USER_CREDITS_PER_USD } from "@/lib/pricing";
import { planPricingCardCopy } from "@/lib/billing/plan-credit-economics";

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_CREDITS = 30;
const ANNUAL_DISCOUNT = 0.20;
const INFINITY_DISCOUNT = 0.05;

const SUPPORT_EMAIL = "support@dreamos86.com";

interface InfinityTier {
  id: string;
  label: string;
  credits: number;
  baseMonthly: number;   // non-discounted monthly price
  discount?: number;     // 0.05 for 5% off
}

const INFINITY_TIERS: InfinityTier[] = [
  { id: "inf-1", label: "Infinity I",   credits: 1_000,  baseMonthly: 100 },
  { id: "inf-2", label: "Infinity II",  credits: 2_000,  baseMonthly: 200 },
  { id: "inf-3", label: "Infinity III", credits: 3_000,  baseMonthly: 300 },
  { id: "inf-4", label: "Infinity IV",  credits: 4_000,  baseMonthly: 400, discount: INFINITY_DISCOUNT },
  { id: "inf-5", label: "Infinity V",   credits: 6_000,  baseMonthly: 600, discount: INFINITY_DISCOUNT },
  { id: "inf-6", label: "Infinity VI",  credits: 9_000,  baseMonthly: 900, discount: INFINITY_DISCOUNT },
  { id: "inf-7", label: "Infinity VII", credits: 13_000, baseMonthly: 1300, discount: INFINITY_DISCOUNT },
];

function tierPrice(tier: InfinityTier, annual: boolean): number {
  const base = tier.discount ? Math.round(tier.baseMonthly * (1 - tier.discount)) : tier.baseMonthly;
  if (annual) return Math.round(base * (1 - ANNUAL_DISCOUNT));
  return base;
}

function tierOriginalPrice(tier: InfinityTier): number {
  return tier.baseMonthly;
}

// ─── Comparison table data ────────────────────────────────────────────────────

const COMPARISON_ROWS: { label: string; free: string | boolean; starter: string | boolean; pro: string | boolean; infinity: string | boolean }[] = [
  { label: "Monthly credits",      free: "30",        starter: "200",      pro: "500",           infinity: "1,000–13,000" },
  { label: "Active projects",      free: "3",         starter: "Unlimited", pro: "Unlimited",    infinity: "Unlimited" },
  { label: "Discuss mode",         free: true,        starter: true,        pro: true,           infinity: true },
  { label: "Edit mode",            free: true,        starter: true,        pro: true,           infinity: true },
  { label: "Build mode",           free: true,        starter: true,        pro: true,           infinity: true },
  { label: "Manual model select",  free: false,       starter: true,        pro: true,           infinity: true },
  { label: "Frontier models",      free: false,       starter: "Standard",  pro: "All",          infinity: "All" },
  { label: "Custom domains",       free: false,       starter: true,        pro: "Unlimited",    infinity: "Unlimited" },
  { label: "Remove watermark",     free: false,       starter: true,        pro: true,           infinity: true },
  { label: "Source export",        free: false,       starter: true,        pro: true,           infinity: true },
  { label: "Team collaborators",   free: false,       starter: false,       pro: "5",            infinity: "Custom" },
  { label: "Analytics",            free: false,       starter: true,        pro: true,           infinity: true },
  { label: "ZIP import",           free: false,       starter: false,       pro: true,           infinity: true },
  { label: "Android AAB & APK export", free: false,   starter: false,       pro: true,           infinity: true },
  { label: "API access",           free: false,       starter: false,       pro: true,           infinity: true },
  { label: "Dedicated compute",    free: false,       starter: false,       pro: false,          infinity: true },
  { label: "White-label",          free: false,       starter: false,       pro: false,          infinity: true },
  { label: "SSO / SAML",          free: false,       starter: false,       pro: false,          infinity: true },
  { label: "Support",             free: "Email",     starter: "Support",   pro: "Priority",      infinity: "Dedicated" },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "What are credits?",
    a: `Credits pay for AI work in DreamOS86. You get ${USER_CREDITS_PER_USD} credits per $1 on paid packs (e.g. $5 → ${CREDIT_PACKAGE_EXAMPLES[0].credits} credits). Builds show an estimated cost and reserved credits before you run; unused reserved credits are returned after completion.`,
  },
  {
    q: "How much does a typical build cost?",
    a: `${BUILD_CREDIT_HINTS.simple}. ${BUILD_CREDIT_HINTS.standard}. ${BUILD_CREDIT_HINTS.advanced}. Premium models cost more — shown before you confirm. ${BUILD_CREDIT_HINTS.refundNote}.`,
  },
  {
    q: "Do credits roll over to next month?",
    a: "Credits reset at the start of each billing period. Unused credits do not carry forward. If you need more capacity, you can upgrade to a higher plan or contact us for a custom arrangement.",
  },
  {
    q: "Can I change my plan at any time?",
    a: "Yes. You can upgrade or downgrade your plan at any time. Upgrades start a new billing cycle immediately: you pay the full new plan price today, your renewal date resets, and your monthly Build Credits and Action Credits refresh to the new plan allowance. Downgrades apply at your next renewal.",
  },
  {
    q: "Do upgrades use prorated billing?",
    a: "No. Plan upgrades are not prorated. When you upgrade, you start a new billing cycle and receive the full credit allowance for the new plan. This keeps pricing simple and prevents unexpected credit abuse.",
  },
  {
    q: "Do unused credits carry over when I upgrade?",
    a: "Monthly plan credits do not stack or roll over when upgrading. Your new plan starts fresh with its full Build Credit and Action Credit allowance. Purchased credit packs or admin-granted bonus credits may remain separate if applicable.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "When you use all your monthly credits, new generation requests will be paused until your credits reset at the start of the next period. You can upgrade your plan at any time to continue immediately.",
  },
  {
    q: "How does annual billing work?",
    a: "Annual plans are billed once per year at a 20% discount compared to the equivalent monthly plan. Credits remain exactly the same — you get the same monthly allowance, just at a lower per-month cost.",
  },
  {
    q: "What is Infinity?",
    a: "Infinity is our enterprise-tier product for teams and power users who need high monthly credit volumes, all frontier models, dedicated infrastructure, concurrency, white-labeling, SSO, and a dedicated support tier. You pick a tier (I–VII) based on your monthly credit needs.",
  },
  {
    q: "Can I get a custom plan?",
    a: "Yes. If your team's needs exceed Infinity VII or you need special compliance, custom SLAs, or bespoke infrastructure, contact us and we'll design a plan around your requirements.",
  },
  {
    q: "Do paid plans remove the DreamOS86 watermark?",
    a: "Yes. All paid plans (Starter and above) remove the DreamOS86 branding from your deployed apps. The Free plan shows a subtle 'Built with DreamOS86' badge.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. You can cancel your subscription at any time. Your plan stays active until the end of the current billing period, then reverts to Free. No lock-ins, no cancellation fees.",
  },
  {
    q: "What is your refund policy?",
    a: "refund-policy-link",
  },
];

const FAQ_REFUND_ANSWER = (
  <>
    DreamOS86 subscriptions may qualify for a refund within a limited window after purchase. Build Credits and Action
    Credits are generally not refundable once consumed. Generated-app payments follow your connected processor&apos;s
    rules.{" "}
    <Link href="/refunds" className="font-medium text-accent hover:underline underline-offset-2">
      Read the full Refund Policy
    </Link>
    .
  </>
);

// ─── Cell helper ──────────────────────────────────────────────────────────────

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-positive" strokeWidth={2.5} />;
  if (value === false) return <X className="mx-auto size-3.5 text-muted-foreground/30" strokeWidth={2} />;
  return <span className="text-[12px] text-muted-foreground">{value}</span>;
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-1 py-4 text-left text-[14px] font-medium text-foreground hover:text-accent transition-colors"
      >
        {q}
        {open ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-1 pb-4 text-[13.5px] leading-relaxed text-muted-foreground">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SubscriptionsLockedModal({
  open,
  onClose,
  onContactSupport,
}: {
  open: boolean;
  onClose: () => void;
  onContactSupport: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paid-plans-lock-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] bg-background p-6 shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
          <Sparkles className="size-5 text-accent" strokeWidth={1.65} />
        </div>
        <h2 id="paid-plans-lock-title" className="mt-4 text-[17px] font-semibold tracking-tight text-foreground">
          Paid plans — opening soon
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Starter, Pro, and Infinity checkout is not live yet. Your free workspace keeps working as usual — we&apos;ll
          email the address on your account when billing is ready. Need something custom in the meantime? Use{" "}
          <span className="font-medium text-foreground">Contact us</span> at the bottom of this page.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="accent" size="sm" onClick={onClose}>
            Got it
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose();
              onContactSupport();
            }}
          >
            Contact form
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function ContactSalesModal({
  kind,
  open,
  onClose,
  defaultPlan,
}: {
  kind: "sales" | "support";
  open: boolean;
  onClose: () => void;
  defaultPlan: string;
}) {
  const { profile, user } = useAuthStore();
  const [name, setName] = React.useState(profile?.full_name ?? "");
  const [email, setEmail] = React.useState(profile?.email ?? user?.email ?? "");
  const [company, setCompany] = React.useState("");
  const [teamSize, setTeamSize] = React.useState("");
  const [expectedUsage, setExpectedUsage] = React.useState("");
  const [currentPlan, setCurrentPlan] = React.useState(defaultPlan);
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function copySupportEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      toast.success("Email copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind,
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || null,
          team_size: teamSize.trim() || null,
          expected_usage: expectedUsage.trim() || null,
          current_plan: currentPlan.trim() || null,
          message: message.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
      if (!res.ok) {
        const detail = data.hint ? `${data.error ?? "Request failed"} — ${data.hint}` : (data.error ?? "Request failed");
        throw new Error(detail);
      }
      toast.success(
        kind === "sales"
          ? "Thanks — we'll be in touch shortly."
          : "Message received. We'll get back to you soon.",
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-xl)] bg-background shadow-2xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <p id="contact-modal-title" className="text-[15px] font-semibold text-foreground">
              {kind === "sales" ? "Talk to sales" : "Contact us"}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Tell us what you need — we&apos;ll route this to the right team.
            </p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-muted-foreground hover:bg-surface">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-1">
              <span className="text-[12px] font-medium text-foreground">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5" />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-[12px] font-medium text-foreground">Email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5" />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-[12px] font-medium text-foreground">Company</span>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1.5" placeholder="Acme Inc." />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-[12px] font-medium text-foreground">Team size</span>
              <Input value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="mt-1.5" placeholder="e.g. 5–20" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[12px] font-medium text-foreground">Expected monthly usage</span>
              <Input
                value={expectedUsage}
                onChange={(e) => setExpectedUsage(e.target.value)}
                className="mt-1.5"
                placeholder="Rough credit volume, projects, or seats"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[12px] font-medium text-foreground">Plan</span>
              <Input value={currentPlan} onChange={(e) => setCurrentPlan(e.target.value)} className="mt-1.5" placeholder="Current or target plan" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[12px] font-medium text-foreground">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={4}
                className="mt-1.5 w-full rounded-[var(--radius-md)] bg-surface px-3 py-2.5 text-[13px] text-foreground ring-1 ring-border outline-none focus:ring-accent/40"
                placeholder={kind === "sales" ? "Goals, timeline, compliance needs…" : "How can we help?"}
              />
            </label>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="secondary" size="sm" onClick={copySupportEmail} className="w-full sm:w-auto">
              {copied ? "Copied" : `Copy ${SUPPORT_EMAIL}`}
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={submitting} className="w-full gap-1.5 sm:w-auto">
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              {submitting ? "Sending…" : "Submit"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  id: string;
  name: string;
  price: number | null;
  annualPrice?: number | null;
  annual: boolean;
  credits: string;
  actionCredits?: number;
  actionCreditsBlurb?: string;
  tagline: string;
  features: string[];
  notIncluded?: string[];
  highlight?: boolean;
  badge?: string;
  cta: string;
  currentPlanId?: string | null;
  children?: React.ReactNode;
  ctaOnClick?: () => void;
  /** When set, CTA navigates here (e.g. public marketing signup). */
  ctaHref?: string;
  /** Slightly tighter card when the app sidebar is expanded */
  compact?: boolean;
}

function PlanCard({
  id, name, price, annualPrice, annual, credits, actionCredits, actionCreditsBlurb, tagline, features,
  notIncluded = [], highlight, badge, cta, currentPlanId, children, ctaOnClick, ctaHref, compact,
}: PlanCardProps) {
  const isCurrent = currentPlanId === id;
  const displayPrice = annual && annualPrice != null ? annualPrice : price;
  const originalPrice = annual && annualPrice != null ? price : null;

  return (
    <motion.div
      variants={variants.fadeUp}
      className={cn(
        "relative flex h-full flex-col rounded-[var(--radius-xl)] ring-1 overflow-hidden",
        highlight
          ? "bg-gradient-to-b from-accent/8 via-background to-background ring-accent/40 shadow-[0_0_0_1px_hsl(var(--accent)/0.15),0_12px_40px_-8px_hsl(var(--accent)/0.25)]"
          : "bg-background ring-border",
      )}
    >
      {highlight && (
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-accent to-transparent" />
      )}
      {badge && (
        <div className="absolute right-4 top-4">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {badge}
          </span>
        </div>
      )}
      <div className={cn("flex flex-1 flex-col gap-4 p-6", compact && "gap-3.5 p-5")}>
        {/* Header */}
        <div>
          <p className="text-[13px] font-semibold text-muted-foreground">{name}</p>
          <div className="mt-1 flex items-end gap-1.5">
            {price === 0 ? (
              <span
                className={cn(
                  "font-bold tracking-tight text-foreground leading-none",
                  compact ? "text-[28px]" : "text-[32px]",
                )}
              >
                Free
              </span>
            ) : price === null ? (
              <span className="text-[24px] font-bold tracking-tight text-foreground leading-none">Custom</span>
            ) : (
              <>
                <span
                  className={cn(
                    "font-bold tracking-tight text-foreground leading-none",
                    compact ? "text-[28px]" : "text-[32px]",
                  )}
                >
                  ${displayPrice}
                </span>
                {originalPrice !== null && originalPrice !== displayPrice && (
                  <span className="text-[13px] text-muted-foreground/50 line-through leading-loose">
                    ${originalPrice}
                  </span>
                )}
                <span className="text-[12px] text-muted-foreground pb-1">/mo</span>
              </>
            )}
          </div>
          {annual ? (
            <p
              className={cn(
                "mt-0.5 min-h-[1.125rem] text-[11px] leading-snug",
                price !== null && price !== 0 ? "text-muted-foreground" : "text-muted-foreground/75",
              )}
            >
              {price !== null && price !== 0
                ? `Billed annually (${Math.round(ANNUAL_DISCOUNT * 100)}% off)`
                : "Always free — no annual billing"}
            </p>
          ) : null}
          <p className="mt-2 text-[11.5px] text-muted-foreground leading-snug">{tagline}</p>
        </div>

        {/* Build Credits pill — single line */}
        <div className="rounded-xl bg-accent/8 px-3 py-2.5 ring-1 ring-accent/15">
          <div className="flex min-w-0 items-center gap-2">
            <Zap className="size-3.5 shrink-0 text-accent" strokeWidth={2} />
            <span
              className={cn(
                "whitespace-nowrap font-semibold leading-none text-accent",
                compact ? "text-[10.5px]" : "text-[11px] sm:text-[12px]",
              )}
            >
              {credits}
            </span>
          </div>
        </div>

        {children}

        {/* CTA */}
        {(() => {
          const ctaClass = cn(
            "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition",
            isCurrent
              ? "bg-surface text-muted-foreground ring-1 ring-border cursor-default"
              : highlight
              ? "bg-accent text-white shadow-[0_4px_14px_-4px_hsl(var(--accent)/0.5)] hover:bg-accent/90"
              : "bg-surface text-foreground ring-1 ring-border hover:ring-accent/30",
          );
          if (isCurrent) {
            return (
              <div className={cn(ctaClass, "pointer-events-none cursor-default")}>
                Current plan
              </div>
            );
          }
          if (ctaHref) {
            return (
              <Link href={ctaHref} className={ctaClass}>
                {cta}
                <ArrowRight className="size-3.5" strokeWidth={2.5} />
              </Link>
            );
          }
          if (ctaOnClick) {
            return (
              <button type="button" className={ctaClass} onClick={ctaOnClick}>
                {cta}
                <ArrowRight className="size-3.5" strokeWidth={2.5} />
              </button>
            );
          }
          return (
            <Link href={id === "free" ? "/auth/sign-up" : "/pricing#contact"} className={ctaClass}>
              {cta}
              <ArrowRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          );
        })()}

        {/* Features */}
        <div className="flex-1 space-y-2">
          {features.map((f) => (
            <div key={f} className="flex items-start gap-2">
              <Check className="size-3.5 mt-0.5 shrink-0 text-positive" strokeWidth={2.5} />
              <span className="text-[12.5px] text-foreground/80">{f}</span>
            </div>
          ))}
          {notIncluded.map((f) => (
            <div key={f} className="flex items-start gap-2 opacity-45">
              <X className="size-3 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={2} />
              <span className="text-[12px] text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>

        {actionCredits != null && actionCreditsBlurb ? (
          <div className="mt-auto rounded-xl border border-border/80 bg-surface/50 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Activity className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Action Credits
                </span>
              </div>
              <Link
                href="/help/docs/how-credits-work"
                className="shrink-0 text-[10px] font-medium text-accent hover:underline underline-offset-2"
              >
                What are these?
              </Link>
            </div>
            <p className="mt-2 whitespace-nowrap text-[17px] font-bold leading-none tracking-tight text-foreground tabular-nums">
              {actionCredits.toLocaleString()}
              <span className="text-[12px] font-medium text-muted-foreground"> / mo</span>
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{actionCreditsBlurb}</p>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// ─── Infinity dropdown ────────────────────────────────────────────────────────

function InfinityDropdown({
  annual,
  selectedTier,
  onSelect,
  onContactSales,
}: {
  annual: boolean;
  selectedTier: InfinityTier;
  onSelect: (t: InfinityTier) => void;
  onContactSales?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = React.useState({ top: 0, left: 0, width: 280, maxH: 320 });

  const updatePlacement = React.useCallback(() => {
    if (!btnRef.current || typeof window === "undefined") return;
    const r = btnRef.current.getBoundingClientRect();
    const pad = 16;
    const maxH = Math.max(168, Math.min(400, window.innerHeight - r.bottom - pad));
    const width = Math.max(268, r.width);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPlacement({ top: r.bottom + 6, left, width, maxH });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
  }, [open, annual, selectedTier.id, updatePlacement]);

  React.useEffect(() => {
    if (!open) return;
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  const portal =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" aria-hidden onClick={() => setOpen(false)} />
            <motion.div
              role="listbox"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "fixed",
                top: placement.top,
                left: placement.left,
                width: placement.width,
                maxHeight: placement.maxH,
                zIndex: 9999,
              }}
              className="flex flex-col overflow-hidden rounded-xl bg-background ring-1 ring-border shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [scrollbar-gutter:stable]">
                {INFINITY_TIERS.map((t) => {
                  const price = tierPrice(t, annual);
                  const original = tierOriginalPrice(t);
                  const totalDiscount = t.discount
                    ? t.discount + (annual ? ANNUAL_DISCOUNT : 0)
                    : annual
                    ? ANNUAL_DISCOUNT
                    : 0;
                  const isSelected = t.id === selectedTier.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(t);
                        setOpen(false);
                      }}
                      className={cn(
                        "grid w-full grid-cols-1 items-center gap-x-3 gap-y-1.5 px-3 py-2 text-left transition hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-y-0 sm:py-2.5",
                        isSelected && "bg-accent/8",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span
                            className={cn(
                              "text-[12.5px] font-semibold tracking-tight",
                              isSelected ? "text-accent" : "text-foreground",
                            )}
                          >
                            {t.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground sm:text-[11.5px]">
                            {t.credits.toLocaleString()} credits/mo
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-end sm:justify-center">
                        {totalDiscount > 0 ? (
                          <span className="inline-flex rounded-full bg-positive/12 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-positive">
                            −{Math.min(99, Math.round(totalDiscount * 100))}%
                          </span>
                        ) : (
                          <span className="hidden h-4 w-8 sm:block" aria-hidden />
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 tabular-nums">
                        {price !== original && (
                          <span className="hidden text-[10.5px] text-muted-foreground/45 line-through sm:inline">${original}</span>
                        )}
                        <span className="text-[12px] font-semibold text-foreground sm:text-[12.5px]">
                          ${price}
                          <span className="pl-0.5 text-[10px] font-medium text-muted-foreground">/mo</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="shrink-0 border-t border-border bg-background px-3 py-3">
                <p className="text-center text-[11px] leading-snug text-muted-foreground">
                  Need larger scale?{" "}
                  <button
                    type="button"
                    className="font-semibold text-accent underline-offset-2 hover:underline"
                    onClick={() => {
                      setOpen(false);
                      onContactSales?.();
                    }}
                  >
                    Billing roadmap
                  </button>
                </p>
              </div>
            </motion.div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 text-left text-[12.5px] ring-1 ring-border transition hover:ring-accent/30"
      >
        <span className="min-w-0 truncate font-medium text-foreground">{selectedTier.label}</span>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {selectedTier.discount && (
            <span className="rounded-full bg-positive/12 px-1.5 py-0.5 text-[8.5px] font-bold text-positive">
              {Math.round((selectedTier.discount + (annual ? ANNUAL_DISCOUNT : 0)) * 100)}% off
            </span>
          )}
          {!selectedTier.discount && annual && (
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[8.5px] font-bold text-accent">20%</span>
          )}
          <span className="whitespace-nowrap font-semibold text-foreground">
            ${tierPrice(selectedTier, annual)}
            <span className="font-normal text-muted-foreground">/mo</span>
          </span>
          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} strokeWidth={2} />
        </div>
      </button>
      {portal}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const pricingPageReveal = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
  },
} as const;

const pricingSectionStagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.06 },
  },
} as const;

export function PricingView({ publicMode = false }: { publicMode?: boolean }) {
  const { profile } = useAuthStore();
  const sidebarCollapsed = useAppearanceStore((s) => s.sidebarCollapsed);
  const reduceMotion = useReducedMotion();
  const [annual, setAnnual] = React.useState(false);
  const [infTier, setInfTier] = React.useState<InfinityTier>(INFINITY_TIERS[0]);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [paidLockedOpen, setPaidLockedOpen] = React.useState(false);
  const [contactKind, setContactKind] = React.useState<"sales" | "support">("support");
  const [contactModalKey, setContactModalKey] = React.useState(0);

  const planId = profile?.plan_id ?? null;
  const prettyPlan = planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : "Free";

  function openContact(kind: "sales" | "support") {
    setContactKind(kind);
    setContactModalKey((k) => k + 1);
    setContactOpen(true);
  }

  function openPaidLocked() {
    setPaidLockedOpen(true);
  }

  const signupNext = encodeURIComponent("/pricing");
  const publicPaidCtaHref = publicMode ? `/auth/signup?next=${signupNext}` : undefined;
  const paidCtaHandler = publicMode ? undefined : openPaidLocked;

  const starterMonthly = 20;
  const proMonthly = 50;
  const starterAnnual = Math.round(starterMonthly * (1 - ANNUAL_DISCOUNT));
  const proAnnual = Math.round(proMonthly * (1 - ANNUAL_DISCOUNT));

  const pageMotion = reduceMotion
    ? { initial: false, animate: false }
    : { initial: "hidden" as const, animate: "show" as const };

  return (
    <>
    <motion.div
      {...pageMotion}
      variants={pricingPageReveal}
      className="mx-auto max-w-6xl px-4 py-12 space-y-20"
    >
      {/* Hero */}
      <motion.div
        variants={reduceMotion ? undefined : pricingSectionStagger}
        className="text-center space-y-4"
      >
        <motion.div variants={variants.fadeUp}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent ring-1 ring-accent/20">
            <Sparkles className="size-3" strokeWidth={2} />
            Simple, transparent pricing
          </span>
        </motion.div>
        <motion.h1 variants={variants.fadeUp} className="text-[36px] sm:text-[48px] font-bold tracking-tight text-foreground leading-[1.1]">
          Build anything with AI.
          <br className="hidden sm:block" />
          <span className="text-accent"> Pay only for what you use.</span>
        </motion.h1>
        <motion.p variants={variants.fadeUp} className="max-w-xl mx-auto text-[15px] text-muted-foreground leading-relaxed">
          Every plan includes AI app generation, instant deployment, and real-time collaboration. Credits reset monthly — no commitments.
        </motion.p>
        {/* Billing toggle */}
        <motion.div variants={variants.fadeUp} className="flex items-center justify-center gap-3 pt-2">
          <span className={cn("text-[13px]", !annual ? "font-semibold text-foreground" : "text-muted-foreground")}>Monthly</span>
          <button
            type="button"
            onClick={() => setAnnual((v) => !v)}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              annual ? "bg-accent" : "bg-border",
            )}
            aria-label="Toggle annual billing"
          >
            <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", annual && "translate-x-5")} />
          </button>
          <span className={cn("text-[13px]", annual ? "font-semibold text-foreground" : "text-muted-foreground")}>
            Annual
            <span className="ml-1.5 rounded-full bg-positive/15 px-1.5 py-0.5 text-[10px] font-bold text-positive">Save 20%</span>
          </span>
        </motion.div>
      </motion.div>

      {/* Plan cards — always 4 across on lg+; compact padding when sidebar is expanded */}
      <motion.div
        variants={reduceMotion ? undefined : pricingSectionStagger}
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
          !sidebarCollapsed && "lg:gap-3",
        )}
      >
        <PlanCard
          id="free"
          name="Free"
          price={0}
          annual={annual}
          compact={!sidebarCollapsed}
          credits={planPricingCardCopy("free").buildPill}
          actionCredits={planPricingCardCopy("free").actionCredits}
          actionCreditsBlurb={planPricingCardCopy("free").actionBlurb}
          tagline="Start free — no card required."
          features={[
            planPricingCardCopy("free").taglineBuildFeature,
            "3 active projects",
            "Discuss mode",
            "Public deployments",
            "Automatic model routing",
          ]}
          notIncluded={[
            "Manual model selection",
            "Edit & Build mode",
            "Custom domains",
            "Team access",
          ]}
          cta="Get started free"
          currentPlanId={publicMode ? null : planId}
          ctaHref={publicMode ? `/auth/signup?next=${signupNext}` : undefined}
        />

        <PlanCard
          id="starter"
          name="Starter"
          price={starterMonthly}
          annualPrice={starterAnnual}
          annual={annual}
          compact={!sidebarCollapsed}
          credits={planPricingCardCopy("starter").buildPill}
          actionCredits={planPricingCardCopy("starter").actionCredits}
          actionCreditsBlurb={planPricingCardCopy("starter").actionBlurb}
          tagline="For individuals shipping real products."
          features={[
            planPricingCardCopy("starter").taglineBuildFeature,
            "Unlimited projects",
            "Discuss, Edit & Build modes",
            "Manual model selection",
            "Custom domains",
            "Remove watermark",
            "Full source code export",
            "Email support",
          ]}
          cta="Get Starter"
          currentPlanId={publicMode ? null : planId}
          ctaHref={publicPaidCtaHref}
          ctaOnClick={paidCtaHandler}
        />

        <PlanCard
          id="pro"
          name="Pro"
          price={proMonthly}
          annualPrice={proAnnual}
          annual={annual}
          compact={!sidebarCollapsed}
          credits={planPricingCardCopy("pro").buildPill}
          actionCredits={planPricingCardCopy("pro").actionCredits}
          actionCreditsBlurb={planPricingCardCopy("pro").actionBlurb}
          tagline="For teams building production apps."
          highlight
          badge="Most Popular"
          features={[
            planPricingCardCopy("pro").taglineBuildFeature,
            "All frontier models",
            "Multi-agent generation",
            "5 collaborators",
            "Advanced analytics",
            "API access",
            "Unlimited custom domains",
            "Priority support",
          ]}
          cta="Get Pro"
          currentPlanId={publicMode ? null : planId}
          ctaHref={publicPaidCtaHref}
          ctaOnClick={paidCtaHandler}
        />

        <PlanCard
          id="infinity"
          name="Infinity"
          price={tierPrice(infTier, annual)}
          annual={annual}
          compact={!sidebarCollapsed}
          credits={
            infTier.id === "inf-1"
              ? planPricingCardCopy("infinity").buildPill
              : `${infTier.credits.toLocaleString()}\u00a0Build\u00a0Credits\u00a0/\u00a0mo`
          }
          actionCredits={
            infTier.id === "inf-1" ? planPricingCardCopy("infinity").actionCredits : undefined
          }
          actionCreditsBlurb={
            infTier.id === "inf-1" ? planPricingCardCopy("infinity").actionBlurb : undefined
          }
          tagline="For power teams at any scale."
          features={[
            infTier.id === "inf-1"
              ? planPricingCardCopy("infinity").taglineBuildFeature
              : `${infTier.credits.toLocaleString()} Build Credits / month`,
            "All frontier models",
            "Dedicated compute",
            "White-label",
            "Custom SLAs",
            "SSO / SAML",
            "Dedicated support",
          ]}
          cta="Get Infinity"
          currentPlanId={publicMode ? null : planId}
          ctaHref={publicPaidCtaHref}
          ctaOnClick={paidCtaHandler}
        >
          <InfinityDropdown
            annual={annual}
            selectedTier={infTier}
            onSelect={setInfTier}
            onContactSales={publicMode ? undefined : openPaidLocked}
          />
        </PlanCard>
      </motion.div>

      {/* Custom plan banner */}
      <motion.div
        id="contact"
        variants={reduceMotion ? undefined : variants.fadeUp}
        className="scroll-mt-24 rounded-[var(--radius-xl)] bg-gradient-to-r from-accent/8 via-background to-violet-500/8 ring-1 ring-border px-8 py-8"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
              <Building2 className="size-5 text-accent" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-foreground">Need a custom plan?</p>
              <p className="mt-1 text-[13.5px] text-muted-foreground max-w-lg">
                Tell us your scale, team size, model usage, and infrastructure needs. We&apos;ll build a plan that fits.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:shrink-0">
            <Link
              href="/contact?reason=Support"
              className="flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-accent/90"
            >
              <MessageCircle className="size-4" strokeWidth={1.75} />
              Contact us
            </Link>
            <Link
              href="/contact?reason=Sales"
              className="flex items-center justify-center gap-2 rounded-xl bg-surface px-5 py-2.5 text-[13px] font-semibold text-foreground ring-1 ring-border transition hover:ring-accent/30"
            >
              Talk to sales
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Comparison table */}
      <motion.div variants={reduceMotion ? undefined : variants.fadeUp}>
        <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-6 text-center">Compare plans</h2>
        <div className="overflow-x-auto rounded-[var(--radius-xl)] ring-1 ring-border">
          <table className="w-full min-w-[600px] text-center text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground w-48">Feature</th>
                {["Free", "Starter", "Pro", "Infinity"].map((p) => (
                  <th key={p} className={cn("px-4 py-3 text-[12px] font-semibold", p === "Pro" ? "text-accent" : "text-foreground")}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr key={row.label} className={cn("border-b border-border/50 transition hover:bg-surface/30", i % 2 === 0 && "bg-surface/10")}>
                  <td className="px-4 py-3 text-left text-[12.5px] text-foreground/80 font-medium">{row.label}</td>
                  <td className="px-4 py-3"><Cell value={row.free} /></td>
                  <td className="px-4 py-3"><Cell value={row.starter} /></td>
                  <td className="px-4 py-3"><Cell value={row.pro} /></td>
                  <td className="px-4 py-3"><Cell value={row.infinity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* FAQ */}
      <motion.div variants={reduceMotion ? undefined : variants.fadeUp}>
        <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-6 text-center">Frequently asked questions</h2>
        <div className="mx-auto max-w-2xl rounded-[var(--radius-xl)] bg-background ring-1 ring-border px-6 divide-y divide-border/50">
          {FAQS.map((faq) => (
            <FaqItem
              key={faq.q}
              q={faq.q}
              a={faq.a === "refund-policy-link" ? FAQ_REFUND_ANSWER : faq.a}
            />
          ))}
        </div>
      </motion.div>

      <p className="mt-10 text-center text-[11px] text-muted-foreground">
        <Link href="/help/docs/policies" className="hover:underline underline-offset-4">
          Policies
        </Link>
        {" · "}
        <Link href="/terms" className="hover:underline underline-offset-4">
          Terms
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:underline underline-offset-4">
          Privacy
        </Link>
        {" · "}
        <Link href="/refunds" className="hover:underline underline-offset-4">
          Refunds
        </Link>
      </p>

    </motion.div>

    <SubscriptionsLockedModal
      open={paidLockedOpen}
      onClose={() => setPaidLockedOpen(false)}
      onContactSupport={() => openContact("support")}
    />
    <ContactSalesModal
      key={contactModalKey}
      kind={contactKind}
      open={contactOpen}
      onClose={() => setContactOpen(false)}
      defaultPlan={contactKind === "sales" ? `${prettyPlan} plan · ${infTier.label}` : `${prettyPlan} plan`}
    />
    </>
  );
}
