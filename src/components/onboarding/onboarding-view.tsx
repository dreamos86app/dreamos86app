"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { resolveDisplayName } from "@/lib/profile-display";
import {
  persistReferralCodeForBrowser,
  readReferralCodeFromBrowserCookie,
  DREAMOS_REF_STORAGE_KEY,
} from "@/lib/auth/ref-cookie";
import { DreamOsSetupIcon } from "@/components/onboarding/dreamos-setup-icon";
import { LogoIcon } from "@/components/ui/logo-icon";

const HEAR_ABOUT = [
  { id: "friend", label: "Friend / referral" },
  { id: "tiktok", label: "TikTok / Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "google", label: "Google search" },
  { id: "x", label: "X / Twitter" },
  { id: "other_hear", label: "Other" },
];

const TOTAL_STEPS = 4;

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, user, setProfile } = useAuthStore();

  const [step, setStep] = React.useState(1);
  const [hearAbout, setHearAbout] = React.useState<string | null>(null);
  const [promoInput, setPromoInput] = React.useState("");
  const [promoLocked, setPromoLocked] = React.useState(false);
  const [referralFromUrl, setReferralFromUrl] = React.useState(false);
  const [promoError, setPromoError] = React.useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const replay = searchParams.get("replay") === "1";
  const nextUrl = searchParams.get("next") ?? "/";

  React.useEffect(() => {
    try {
      const ref = searchParams.get("ref")?.trim().toUpperCase();
      if (ref && ref.length >= 4 && ref.length <= 16) {
        persistReferralCodeForBrowser(ref);
        setPromoInput(ref);
        setPromoLocked(true);
        setReferralFromUrl(true);
      }
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  React.useEffect(() => {
    const fromProfile = profile?.referred_by?.trim().toUpperCase() ?? "";
    const fromCookie = readReferralCodeFromBrowserCookie();
    try {
      const ls = window.localStorage.getItem(DREAMOS_REF_STORAGE_KEY)?.trim().toUpperCase() ?? "";
      const locked = fromProfile || fromCookie || ls;
      if (locked) {
        setPromoInput(locked);
        setPromoLocked(true);
        if (searchParams.get("ref")) setReferralFromUrl(true);
      }
    } catch {
      if (fromProfile || fromCookie) {
        setPromoInput(fromProfile || fromCookie || "");
        setPromoLocked(Boolean(fromProfile || fromCookie));
      }
    }
  }, [profile?.referred_by, searchParams]);

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
    if (step === 4) return true;
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

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hear_about: hearLabel || "Not specified",
          build_first: "Getting started",
          promo_code: promoInput.trim() || undefined,
          replay: replay,
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
          use_case: "Getting started",
          signup_wizard_completed: true,
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
      subtitle: "A quick setup, then you can start building.",
      content: (
        <div className="space-y-6">
          <motion.div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/30 to-violet-500/40 text-xl font-bold text-white ring-1 ring-border">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-[13px] text-muted-foreground">{email}</p>
            </div>
          </motion.div>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            DreamOS86 is your workspace to plan, build, preview, and publish real apps with AI — without juggling a dozen tools.
          </p>
        </div>
      ),
    },
    {
      title: "How did you hear about us?",
      subtitle: "Pick the closest match.",
      content: (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {HEAR_ABOUT.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setHearAbout(opt.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3.5 text-left text-[14px] font-medium ring-1 transition",
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
        : "Optional — enter a friend’s code for +20 credits each after you finish.",
      content: (
        <div className="space-y-3">
          {referralFromUrl && promoLocked ? (
            <p className="rounded-lg bg-accent/10 px-3 py-2 text-[12px] font-medium text-accent ring-1 ring-accent/20">
              Referral code applied.
            </p>
          ) : null}
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
              readOnly={promoLocked}
              className={cn("h-12 pr-10 font-mono text-[14px] uppercase", promoLocked && "opacity-90")}
            />
            {promoLocked ? (
              <Lock className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            ) : null}
          </div>
          {validatingPromo ? (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Validating…
            </p>
          ) : null}
          {promoError ? <p className="text-[13px] text-destructive">{promoError}</p> : null}
        </div>
      ),
    },
    {
      title: "You’re ready to build",
      subtitle: "Finish setup and open your workspace.",
      content: (
        <div className="space-y-4 rounded-xl border border-accent/20 bg-accent/[0.06] p-5 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/25">
            <Rocket className="size-7" strokeWidth={1.65} />
          </div>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Your account is set up. Start with Create to describe an app, or open AI Chat to explore models — credits are only used after successful AI steps.
          </p>
        </div>
      ),
    },
  ];

  const isLast = step === TOTAL_STEPS;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoIcon size={36} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">DreamOS86</span>
      </div>

      <div className="w-full max-w-lg sm:max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
            <DreamOsSetupIcon className="size-5 text-accent" />
            Setup · {step} / {TOTAL_STEPS}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 w-8 rounded-full transition-colors",
                  i < step ? "bg-accent" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-background/95 p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.2)] ring-1 ring-border sm:p-10 md:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={transition.card}
            >
              <h1 className="text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]">
                {steps[step - 1].title}
              </h1>
              <p className="mt-2 text-[14px] text-muted-foreground">{steps[step - 1].subtitle}</p>
              <div className="mt-8">{steps[step - 1].content}</div>
            </motion.div>
          </AnimatePresence>

          {saveError ? <p className="mt-6 text-[13px] text-destructive">{saveError}</p> : null}

          <div className="mt-10 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="md"
              className={cn(step === 1 && "invisible")}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={saving}
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} /> Back
            </Button>
            <Button
              type="button"
              variant="accent"
              size="md"
              className="min-h-[44px] gap-2 px-6"
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
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : isLast ? (
                <>
                  Start building <Check className="size-4" strokeWidth={1.75} />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="size-4" strokeWidth={1.75} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
