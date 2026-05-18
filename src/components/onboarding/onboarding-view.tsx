"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { variants, transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { resolveDisplayName } from "@/lib/profile-display";
import {
  persistReferralCodeForBrowser,
  readReferralCodeFromBrowserCookie,
  DREAMOS_REF_STORAGE_KEY,
} from "@/lib/auth/ref-cookie";

const HEAR_ABOUT = [
  { id: "friend", label: "Friend / referral" },
  { id: "tiktok", label: "TikTok / Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "google", label: "Google search" },
  { id: "x", label: "X / Twitter" },
  { id: "other_hear", label: "Other" },
];

const BUILD_FIRST = [
  { id: "saas_dashboard", label: "SaaS dashboard" },
  { id: "ai_chatbot", label: "AI chatbot" },
  { id: "ecommerce", label: "E-commerce" },
  { id: "marketplace", label: "Marketplace" },
  { id: "social", label: "Social app" },
  { id: "internal", label: "Internal tool" },
  { id: "other_build", label: "Other" },
];

const TOTAL_STEPS = 4;

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, user, setProfile } = useAuthStore();

  const [step, setStep] = React.useState(1);
  const [hearAbout, setHearAbout] = React.useState<string | null>(null);
  const [buildFirst, setBuildFirst] = React.useState<string | null>(null);
  const [promoInput, setPromoInput] = React.useState("");
  const [promoLocked, setPromoLocked] = React.useState(false);
  const [promoError, setPromoError] = React.useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const replay = searchParams.get("replay") === "1";
  const nextUrl = searchParams.get("next") ?? "/";

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref")?.trim().toUpperCase();
      if (ref && ref.length >= 4 && ref.length <= 16) {
        persistReferralCodeForBrowser(ref);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    const fromProfile = profile?.referred_by?.trim().toUpperCase() ?? "";
    const fromCookie = readReferralCodeFromBrowserCookie();
    try {
      const ls = window.localStorage.getItem(DREAMOS_REF_STORAGE_KEY)?.trim().toUpperCase() ?? "";
      const locked = fromProfile || fromCookie || ls;
      if (locked) {
        setPromoInput(locked);
        setPromoLocked(true);
      }
    } catch {
      if (fromProfile || fromCookie) {
        setPromoInput(fromProfile || fromCookie || "");
        setPromoLocked(Boolean(fromProfile || fromCookie));
      }
    }
  }, [profile?.referred_by]);

  React.useEffect(() => {
    if (!profile?.onboarding_completed || replay) return;
    router.replace("/");
  }, [profile?.onboarding_completed, replay, router]);

  const displayName = resolveDisplayName(profile, user);
  const email = profile?.email ?? user?.email ?? "";
  const avatarUrl = profile?.avatar_url ?? null;

  function canAdvance() {
    if (step === 1) return true;
    if (step === 2) return Boolean(hearAbout);
    if (step === 3) {
      if (!promoInput.trim()) return true;
      return !promoError;
    }
    if (step === 4) return Boolean(buildFirst);
    return false;
  }

  async function validatePromoManual(): Promise<boolean> {
    const raw = promoInput.trim().toUpperCase();
    if (!raw || promoLocked) {
      setPromoError(null);
      return true;
    }
    setValidatingPromo(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/referrals/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        setPromoError(
          data.error === "self_referral"
            ? "You can’t use your own referral code."
            : data.error === "code_not_found"
              ? "That code wasn’t found."
              : "Invalid referral code.",
        );
        return false;
      }
      setPromoError(null);
      return true;
    } catch {
      setPromoError("Couldn’t validate code. Try again.");
      return false;
    } finally {
      setValidatingPromo(false);
    }
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      const hearLabel = HEAR_ABOUT.find((h) => h.id === hearAbout)?.label ?? hearAbout ?? "";
      const buildLabel = BUILD_FIRST.find((b) => b.id === buildFirst)?.label ?? buildFirst ?? "";

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hear_about: hearLabel,
          build_first: buildLabel,
          promo_code: promoInput.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "Couldn’t save onboarding. Check your referral code or try again.",
        );
        setSaving(false);
        return;
      }

      if (profile) {
        setProfile({
          ...profile,
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          use_case: buildLabel,
        });
      }

      try {
        window.localStorage.removeItem(DREAMOS_REF_STORAGE_KEY);
      } catch {
        /* ignore */
      }

      const dest = nextUrl.startsWith("/") ? nextUrl : "/";
      router.push(dest);
      router.refresh();
    } catch {
      setSaveError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    {
      title: "Welcome to DreamOS86",
      subtitle: "Let’s personalize your workspace in a minute.",
      content: (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-violet-500/50 text-lg font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-[12px] text-muted-foreground">{email}</p>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            DreamOS86 helps you design and ship real apps with AI — faster, with a premium builder
            experience.
          </p>
        </div>
      ),
    },
    {
      title: "How did you hear about us?",
      subtitle: "Pick the closest match.",
      content: (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {HEAR_ABOUT.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setHearAbout(opt.id)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-left text-[13px] font-medium ring-1 transition",
                hearAbout === opt.id
                  ? "bg-accent/10 ring-accent/35 text-foreground"
                  : "bg-surface ring-border text-foreground/90 hover:ring-accent/18",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  hearAbout === opt.id ? "border-accent bg-accent text-white" : "border-border",
                )}
              >
                {hearAbout === opt.id ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Promo / referral code",
      subtitle: promoLocked
        ? "This code was applied from your invite link."
        : "Optional — enter a friend’s code if you have one.",
      content: (
        <div className="space-y-3">
          <div className="relative">
            <Input
              value={promoInput}
              onChange={(e) => {
                if (promoLocked) return;
                setPromoInput(e.target.value.toUpperCase());
                setPromoError(null);
              }}
              onBlur={() => {
                void validatePromoManual();
              }}
              placeholder="e.g. ABC12XYZ"
              disabled={promoLocked}
              className={cn("pr-10 font-mono text-[13px] uppercase", promoLocked && "opacity-90")}
            />
            {promoLocked ? (
              <Lock className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            ) : null}
          </div>
          {validatingPromo ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Validating…
            </p>
          ) : null}
          {promoError ? (
            <p className="text-[12px] text-destructive">{promoError}</p>
          ) : null}
        </div>
      ),
    },
    {
      title: "What do you want to build first?",
      subtitle: "We’ll tune defaults to match.",
      content: (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BUILD_FIRST.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBuildFirst(opt.id)}
              className={cn(
                "rounded-[var(--radius-lg)] px-4 py-3 text-left text-[13px] font-medium ring-1 transition",
                buildFirst === opt.id
                  ? "bg-accent/10 ring-accent/35 text-foreground"
                  : "bg-surface ring-border text-foreground/90 hover:ring-accent/18",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ),
    },
  ];

  const isLast = step === TOTAL_STEPS;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <motion.div
        variants={variants.fadeUp}
        initial="hidden"
        animate="show"
        className="w-full max-w-lg"
      >
        <div className="mb-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
          <Sparkles className="size-3.5" strokeWidth={1.75} />
          Onboarding · step {step} of {TOTAL_STEPS}
        </div>

        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-glass shadow-[var(--shadow-glass)] ring-1 ring-border p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={transition.card}
            >
              <h1 className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">
                {steps[step - 1].title}
              </h1>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{steps[step - 1].subtitle}</p>
              <div className="mt-7">{steps[step - 1].content}</div>
            </motion.div>
          </AnimatePresence>

          {saveError ? (
            <p className="mt-5 text-[12px] text-destructive">{saveError}</p>
          ) : null}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(step === 1 && "invisible")}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={saving}
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.75} /> Back
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="gap-1.5"
              disabled={!canAdvance() || saving || (step === 3 && Boolean(promoError))}
              onClick={() => {
                void (async () => {
                  if (step === 3) {
                    if (promoInput.trim() && !(await validatePromoManual())) return;
                  }
                  if (isLast) void finish();
                  else setStep((s) => Math.min(TOTAL_STEPS, s + 1));
                })();
              }}
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Saving…
                </>
              ) : isLast ? (
                <>
                  Finish <Check className="size-3.5" strokeWidth={1.75} />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="size-3.5" strokeWidth={1.75} />
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
