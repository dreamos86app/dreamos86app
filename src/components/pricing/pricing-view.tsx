"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Zap, CreditCard, X, Bell, Sparkles,
  ChevronDown, Infinity as InfinityIcon, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";

// ─── Plan data ────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number | null;
  priceSuffix?: string;
  tagline: string;
  highlight?: boolean;
  features: string[];
  notIncluded?: string[];
  badge?: string;
  models: string;
  cta: string;
  /** Monthly credit allowance shown on the card */
  monthlyCredits: string;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Start building for free. No card required.",
    models: "Fast models (auto-routed)",
    monthlyCredits: "100 credits / mo",
    features: [
      "100 orchestration credits / month",
      "3 active projects",
      "Discuss mode only",
      "Public deployments",
      "Automatic model routing",
      "Basic build concurrency",
    ],
    notIncluded: ["Manual model selection", "Custom domains", "Build & Edit mode", "Team access", "Analytics"],
    cta: "Get started free",
  },
  {
    id: "starter",
    name: "Starter",
    price: 20,
    tagline: "For individuals shipping real products.",
    models: "Standard + Premium models",
    monthlyCredits: "10,000 credits / mo",
    features: [
      "10,000 orchestration credits / month",
      "Unlimited projects",
      "Discuss, Edit & Build modes",
      "Manual model selection",
      "Custom domains",
      "Remove watermark",
      "Full source code export",
      "Premium exports",
      "Email support",
    ],
    cta: "Get Starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: 50,
    tagline: "For teams building production apps.",
    highlight: true,
    badge: "Most Popular",
    models: "All models including Opus & GPT-5.5",
    monthlyCredits: "25,000 credits / mo",
    features: [
      "25,000 orchestration credits / month",
      "All frontier models (Opus 4.7, GPT-5.5, Gemini 2.5 Pro)",
      "Multi-agent orchestration pipelines",
      "Production-scale infrastructure",
      "Unlimited custom domains",
      "5 collaborators",
      "Advanced analytics",
      "API access",
      "Priority support",
    ],
    cta: "Get Pro",
  },
  {
    id: "infinity",
    name: "Infinity",
    price: 100,
    priceSuffix: "from",
    tagline: "Enterprise orchestration platform for power teams.",
    models: "All models + dedicated compute",
    monthlyCredits: "50k – 683.5k credits / mo",
    features: [
      "50k–683.5k orchestration credits / month",
      "Enterprise-grade concurrency (parallel agents)",
      "Dedicated runtime & priority compute",
      "White-label platform",
      "Unlimited collaborators",
      "Custom SLAs & uptime guarantees",
      "SSO / SAML",
      "Advanced infrastructure controls",
      "5% enterprise volume discount (Tiers IV+)",
    ],
    cta: "Get Infinity",
  },
];

// ─── Infinity pricing engine ──────────────────────────────────────────────────
//
// ECONOMY RULE (NORMALIZED):
//   $1 = 500 credits across ALL plans with NO exceptions.
//   Plans differ by PLATFORM POWER: concurrency, models, orchestration, infra.
//   NOT by credits-per-dollar ratio.
//
//   Base rate: 500 credits / $ (same as Pro: 25,000 credits / $50)
//   Credits per tier = rawPrice × 500 (rounded to clean numbers).
//
//   Tiers I–III: standard pricing at base rate.
//   Tiers IV–VIII: 5% enterprise volume discount on the monthly price.
//     → discount reduces price, credits stay at rawPrice × 500.
//     → effective CPD slightly above 500 (by exactly 1/0.95 ≈ 1.053×).
//     → this is the ONLY permitted value improvement — via explicit discount.
//
//   Annual billing: 20% off monthly for all paid plans.

const BASE_CREDITS_PER_DOLLAR = 500;

const INFINITY_TIERS: Array<{
  label: string;
  rawPrice: number;    // undiscounted monthly price → credits = rawPrice × 500
  price: number;       // display monthly price (post 5% enterprise discount)
  credits: number;     // orchestration credits / month
  display: string;     // human-friendly credit count
  hasDiscount: boolean;
}> = [
  { label: "Infinity I",    rawPrice: 100,  price: 100,  credits:    50_000, display:  "50k",  hasDiscount: false },
  { label: "Infinity II",   rawPrice: 175,  price: 175,  credits:    87_500, display: "87.5k", hasDiscount: false },
  { label: "Infinity III",  rawPrice: 280,  price: 280,  credits:   140_000, display:  "140k", hasDiscount: false },
  { label: "Infinity IV",   rawPrice: 442,  price: 420,  credits:   221_000, display:  "221k", hasDiscount: true  },
  { label: "Infinity V",    rawPrice: 632,  price: 600,  credits:   316_000, display:  "316k", hasDiscount: true  },
  { label: "Infinity VI",   rawPrice: 884,  price: 840,  credits:   442_000, display:  "442k", hasDiscount: true  },
  { label: "Infinity VII",  rawPrice: 1179, price: 1120, credits:   589_500, display: "589.5k", hasDiscount: true },
  { label: "Infinity VIII", rawPrice: 1367, price: 1299, credits:   683_500, display: "683.5k", hasDiscount: true },
];

/**
 * Normalizes credits for all tiers to guarantee linear CPD at rawPrice.
 * Returns a validated copy — call this when displaying or verifying.
 */
export function normalizeCreditEconomy() {
  return INFINITY_TIERS.map((t) => ({
    ...t,
    credits: Math.round(t.rawPrice * BASE_CREDITS_PER_DOLLAR),
  }));
}

/**
 * Validates that every Infinity tier maintains $1 = 500 credits at rawPrice.
 * Discounted tiers may have slightly higher effective CPD (max 1/0.95 ≈ 526).
 */
export function validateCreditLinearity() {
  const TOLERANCE = 0.01; // 1% to catch float rounding
  const MAX_DISCOUNT_FACTOR = 1 / 0.95 + TOLERANCE; // max CPD uplift from 5% discount
  for (const t of INFINITY_TIERS) {
    const baseCPD = t.credits / t.rawPrice;
    if (Math.abs(baseCPD - BASE_CREDITS_PER_DOLLAR) / BASE_CREDITS_PER_DOLLAR > TOLERANCE) {
      throw new Error(
        `[pricing] Tier ${t.label}: base CPD ${baseCPD.toFixed(1)} deviates from ${BASE_CREDITS_PER_DOLLAR} credits/$ (rawPrice=${t.rawPrice}, credits=${t.credits})`,
      );
    }
    const effectiveCPD = t.credits / t.price;
    if (t.hasDiscount && effectiveCPD > BASE_CREDITS_PER_DOLLAR * MAX_DISCOUNT_FACTOR) {
      throw new Error(
        `[pricing] Tier ${t.label}: discounted CPD ${effectiveCPD.toFixed(1)} exceeds max allowed ${(BASE_CREDITS_PER_DOLLAR * MAX_DISCOUNT_FACTOR).toFixed(1)}`,
      );
    }
  }
  return true;
}

/** @deprecated Use validateCreditLinearity */
export function validatePlanEconomics() {
  return validateCreditLinearity();
}

// Dev-only integrity check
if (process.env.NODE_ENV === "development") {
  try { validateCreditLinearity(); } catch (e) { console.error(e); }
}

// ─── Payments coming soon modal ───────────────────────────────────────────────

function PaymentsComingSoonModal({ planName, onClose }: { planName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] bg-background shadow-2xl ring-1 ring-border"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-accent/10">
              <CreditCard className="size-5 text-accent" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">{planName} — Coming Soon</p>
              <p className="text-[12px] text-muted-foreground">Payments launching soon</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            DreamOS86 is in early access. Paid plans are being finalized and will launch shortly.
            You&apos;ll receive an email the moment billing goes live.
          </p>
          <button
            onClick={onClose}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.98]"
          >
            <Bell className="size-3.5" strokeWidth={2} />
            Got it — I&apos;ll wait
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onSelect,
  currentPlanId,
  isAnnual = false,
}: {
  plan: Plan;
  onSelect: (planId: string) => void;
  currentPlanId?: string;
  isAnnual?: boolean;
}) {
  const isCurrent = currentPlanId === plan.id || (plan.id === "free" && !currentPlanId);
  const isInfinity = plan.id === "infinity";
  const [tierOpen, setTierOpen] = React.useState(false);
  const [selectedTier, setSelectedTier] = React.useState(0);
  const tierRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!tierOpen) return;
    function handler(e: MouseEvent) {
      if (tierRef.current && !tierRef.current.contains(e.target as Node)) setTierOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tierOpen]);

  const tierData = INFINITY_TIERS[selectedTier];
  const basePrice = isInfinity ? tierData.price : plan.price;
  // Annual: 20% off for all paid plans including Infinity
  const displayPrice = (isAnnual && basePrice && basePrice > 0)
    ? Math.round(basePrice * 0.8)
    : basePrice;
  // Annual savings
  const annualSavings = (isAnnual && basePrice && basePrice > 0)
    ? Math.round(basePrice * 0.2 * 12)
    : 0;
  // Credits label: Infinity shows tier-specific count, others show plan default
  const creditsLabel = isInfinity
    ? `${tierData.display} orchestration credits / mo`
    : plan.monthlyCredits;

  return (
    <motion.div
      variants={variants.fadeUp}
      className={cn(
        "relative flex flex-col rounded-[var(--radius-2xl)] p-5 ring-1 transition",
        plan.highlight
          ? "bg-accent/5 ring-accent/35 shadow-[0_0_0_4px_hsl(var(--accent)/0.06)]"
          : "bg-surface ring-border",
      )}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-0.5 text-[10.5px] font-semibold text-white">
          {plan.badge}
        </span>
      )}

      {/* Name + tagline */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">{plan.name}</h3>
          {isInfinity && <InfinityIcon className="size-4 text-accent" strokeWidth={1.75} />}
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{plan.tagline}</p>
      </div>

      {/* Price */}
      <div className="mb-3">
        {plan.price === 0 ? (
          <p className="text-[28px] font-semibold tracking-tight text-foreground">Free</p>
        ) : (
          <div className="flex items-baseline gap-1">
            {plan.priceSuffix && (
              <span className="text-[11px] text-muted-foreground mr-0.5">{plan.priceSuffix}</span>
            )}
            <span className="text-[28px] font-semibold tracking-tight text-foreground">
              ${displayPrice}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {isAnnual && basePrice && basePrice > 0 ? "/mo, billed annually" : "/mo"}
            </span>
          </div>
        )}
        {isAnnual && annualSavings > 0 && basePrice != null && (
          <p className="mt-0.5 text-[11px] text-positive">
            ${Math.round(basePrice * 0.8 * 12)}/yr · save ${annualSavings}
          </p>
        )}
      </div>

      {/* Credits badge — dynamic for Infinity */}
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-accent/8 px-2.5 py-1">
        <Zap className="size-3 text-accent" strokeWidth={2} />
        <span className="text-[11.5px] font-semibold text-accent">{creditsLabel}</span>
      </div>

      {/* Infinity tier selector */}
      {isInfinity && (
        <div ref={tierRef} className="relative mb-4">
          <button
            type="button"
            onClick={() => setTierOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-background px-3 py-2 text-[12px] ring-1 ring-border transition hover:ring-accent/40"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-accent" strokeWidth={1.75} />
              <span className="font-medium text-foreground">{tierData.label}</span>
              <span className="text-muted-foreground">{tierData.display} credits</span>
              {tierData.hasDiscount && (
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600/80">
                  5% off
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-[12px] font-semibold text-foreground">
                ${displayPrice}/mo
              </span>
              <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", tierOpen && "rotate-180")} strokeWidth={1.75} />
            </div>
          </button>
          <AnimatePresence>
            {tierOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl bg-background shadow-lg ring-1 ring-border"
              >
                {INFINITY_TIERS.map((t, i) => {
                  const tPrice = isAnnual ? Math.round(t.price * 0.8) : t.price;
                  return (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => { setSelectedTier(i); setTierOpen(false); }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] transition hover:bg-surface",
                        selectedTier === i && "bg-surface",
                      )}
                    >
                      <div>
                        <p className="font-medium text-foreground">{t.label}</p>
                        <p className="text-[10.5px] text-muted-foreground">{t.display} credits/mo</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-foreground">${tPrice}/mo</p>
                        {isAnnual && (
                          <p className="text-[10px] text-positive">−20% annual</p>
                        )}
                      </div>
                    </button>
                  );
                })}
                <div className="border-t border-border px-3 py-2">
                  <p className="text-[10.5px] text-muted-foreground/60">
                    5% enterprise discount from Tier IV · $1 = 500 credits across all plans
                  </p>
                  <a
                    href="mailto:dreamos86app@gmail.com?subject=Enterprise inquiry"
                    className="mt-1 flex items-center gap-1.5 text-[11.5px] text-accent hover:underline underline-offset-2"
                  >
                    <Mail className="size-3.5" strokeWidth={1.75} />
                    Need larger scale? Contact us
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Models label */}
      <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground ring-1 ring-border/60">
        <Sparkles className="size-3 shrink-0 text-accent" strokeWidth={1.75} />
        {plan.models}
      </div>

      {/* CTA */}
      {isCurrent ? (
        <div className="mb-5 flex items-center justify-center rounded-xl bg-muted/40 py-2.5 text-[12.5px] font-medium text-muted-foreground ring-1 ring-border">
          Current plan
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(plan.id)}
          className={cn(
            "mb-5 flex w-full cursor-pointer items-center justify-center rounded-xl py-2.5 text-[13px] font-semibold transition active:scale-[0.98]",
            plan.highlight
              ? "bg-accent text-white shadow-[0_2px_12px_hsl(var(--accent)/0.35)] hover:bg-accent/90"
              : plan.id === "free"
                ? "bg-surface text-foreground ring-1 ring-border hover:ring-accent/40 hover:bg-background"
                : "bg-foreground text-background hover:opacity-90",
          )}
        >
          {plan.cta}
        </button>
      )}

      <div className="h-px bg-border" />

      {/* Features */}
      <ul className="mt-4 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12.5px] text-foreground/80">
            <Check className="mt-0.5 size-3.5 shrink-0 text-positive" strokeWidth={2.5} />
            {f}
          </li>
        ))}
        {plan.notIncluded?.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12px] text-muted-foreground/45 line-through">
            <X className="mt-0.5 size-3.5 shrink-0 opacity-30" strokeWidth={2} />
            {f}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ─── Main pricing view ────────────────────────────────────────────────────────

export function PricingView() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [comingSoonPlan, setComingSoonPlan] = React.useState<string | null>(null);
  const [isAnnual, setIsAnnual] = React.useState(false);

  function handleSelect(planId: string) {
    if (planId === "free") {
      if (!profile) router.push("/auth/signup");
      return;
    }
    if (!profile) { router.push("/auth/signup"); return; }
    const labels: Record<string, string> = {
      starter: "Starter",
      pro: "Pro",
      business: "Business",
      infinity: "Infinity",
    };
    setComingSoonPlan(labels[planId] ?? planId);
  }

  return (
    <>
      <motion.div
        variants={variants.staggerContainer}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-6xl space-y-10 pb-16"
      >
        {/* Header */}
        <motion.div variants={variants.fadeUp} className="text-center space-y-4">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-foreground">
            Choose your plan
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Credits scale dynamically with your usage. No hidden fees. Cancel anytime.
          </p>

          {/* Annual / Monthly toggle */}
          <div className="inline-flex items-center gap-3 rounded-full bg-surface px-2 py-1.5 ring-1 ring-border">
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[12.5px] font-medium transition",
                !isAnnual
                  ? "bg-background text-foreground shadow-[var(--shadow-xs)] ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-medium transition",
                isAnnual
                  ? "bg-background text-foreground shadow-[var(--shadow-xs)] ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Annual
              <span className="rounded-full bg-positive/15 px-1.5 py-0.5 text-[10px] font-semibold text-positive">
                Save 20%
              </span>
            </button>
          </div>
          {isAnnual && (
            <p className="text-[12px] text-positive">
              Billed annually — 2 months free
            </p>
          )}
        </motion.div>

        {/* 4 plan cards in one row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onSelect={handleSelect}
              currentPlanId={profile?.plan_id}
              isAnnual={isAnnual}
            />
          ))}
        </div>

        {/* FAQ */}
        <motion.div variants={variants.fadeUp} className="space-y-4">
          <h3 className="text-[15px] font-semibold text-foreground">Common questions</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                q: "What are credits?",
                a: "Credits represent AI compute value. Each request costs credits based on the model selected, context size, and complexity. All costs are calculated transparently.",
              },
              {
                q: "Do unused credits roll over?",
                a: "No. Credits reset monthly to keep pricing predictable. Your projects and data are never affected.",
              },
              {
                q: "Can I change my plan mid-cycle?",
                a: "Yes. Upgrades are immediate and pro-rated. Downgrades take effect at the next billing period.",
              },
              {
                q: "What's the 5% savings on Infinity?",
                a: "All Infinity tiers above $300/mo automatically receive a 5% volume discount, with price steps increasing by $150 from Infinity IV onward.",
              },
            ].map((faq) => (
              <div key={faq.q} className="rounded-[var(--radius-lg)] bg-surface px-5 py-4 ring-1 ring-border">
                <p className="text-[13px] font-semibold text-foreground">{faq.q}</p>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {comingSoonPlan && (
          <PaymentsComingSoonModal
            planName={comingSoonPlan}
            onClose={() => setComingSoonPlan(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
