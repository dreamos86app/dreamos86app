"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Sparkles,
  Plus,
  LayoutGrid,
  TrendingUp,
  Users,
  Rocket,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IntegrationShowcaseSection } from "@/components/marketing/integrations-showcase";
import { YourAppsSection, type YourAppsProject } from "@/components/os-home/your-apps-section";
import { ModelUsageDonut } from "@/components/dashboard/model-usage-donut";
import { useAuthStore } from "@/lib/stores/auth-store";
import { storeAutostartHandoff } from "@/lib/create/autostart-handoff";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { resolveDisplayName } from "@/lib/profile-display";
import { applyComposerPaste } from "@/lib/composer/textarea-handlers";
import { ModelPicker } from "@/components/create/workspace/model-picker";
import {
  PlanFirstToggle,
  buildStrategyFromToggle,
  suggestBuildStrategy,
  toggleFromBuildStrategy,
  type BuildStrategy,
} from "@/components/create/workspace/plan-first-control";
import { DEFAULT_MODEL_ID } from "@/lib/creation/models";
import {
  pickRandomAppIdeas,
  pickComposerChipIdeas,
  SSR_HOME_IDEAS_SEED,
  type AppIdeaPrompt,
} from "@/lib/inspiration/app-idea-prompts";

const DreamOsStatsSection = dynamic(
  () => import("@/components/os-home/dreamos-stats-section").then((m) => m.DreamOsStatsSection),
  { loading: () => <div className="mx-auto h-52 max-w-5xl animate-pulse rounded-2xl bg-muted/20" /> },
);

const WhyDreamOsSection = dynamic(
  () => import("@/components/os-home/why-dreamos-section").then((m) => m.WhyDreamOsSection),
  { loading: () => <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-2xl bg-muted/15" /> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type RecentProject = YourAppsProject;

// ─── Constants ────────────────────────────────────────────────────────────────

const HOME_COMPOSER_CHIP_SEED = `${SSR_HOME_IDEAS_SEED}:composer`;
const HOME_INSPIRATION_SEED = `${SSR_HOME_IDEAS_SEED}:feed`;

function useTimeGreeting(): string {
  const hydrated = useHydrated();
  return React.useMemo(() => {
    if (!hydrated) return "Welcome";
    const h = new Date().getHours();
    if (h < 5) return "Still up?";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Night owl mode";
  }, [hydrated]);
}

const TEMPLATES = [
  { label: "SaaS Dashboard", prompt: "Build a premium SaaS dashboard with analytics, team management, billing, and role-based access control.", icon: "📊", gradient: "from-blue-500/20 to-violet-500/20" },
  { label: "AI Chatbot", prompt: "Create a production-grade AI chatbot platform with streaming responses, conversation history, and model selection.", icon: "🤖", gradient: "from-violet-500/20 to-pink-500/20" },
  { label: "E-commerce", prompt: "Build a modern e-commerce platform with product catalog, cart, checkout, Stripe payments, and order tracking.", icon: "🛍️", gradient: "from-emerald-500/20 to-cyan-500/20" },
  { label: "Social App", prompt: "Create a social platform with profiles, real-time feed, following, likes, comments, and notifications.", icon: "💬", gradient: "from-amber-500/20 to-orange-500/20" },
  { label: "Portfolio", prompt: "Build a stunning developer portfolio with animated hero, project showcase, skills section, and contact form.", icon: "✨", gradient: "from-pink-500/20 to-rose-500/20" },
  { label: "CRM", prompt: "Create an AI-powered CRM with contact management, deal pipeline, activity tracking, and automated follow-ups.", icon: "📋", gradient: "from-cyan-500/20 to-blue-500/20" },
];

/** Random ideas after hydration; stable SSR + first paint to avoid mismatch. */
function useSessionAppIdeas(count: number): AppIdeaPrompt[] {
  const hydrated = useHydrated();
  const [ideas, setIdeas] = React.useState(() =>
    pickRandomAppIdeas(count, HOME_INSPIRATION_SEED),
  );
  React.useEffect(() => {
    if (!hydrated) return;
    setIdeas(pickRandomAppIdeas(count));
  }, [hydrated, count]);
  return ideas;
}

function useSessionComposerIdeas(count: number) {
  const hydrated = useHydrated();
  const [ideas, setIdeas] = React.useState(() =>
    pickComposerChipIdeas(count, HOME_COMPOSER_CHIP_SEED),
  );
  React.useEffect(() => {
    if (!hydrated) return;
    setIdeas(pickComposerChipIdeas(count));
  }, [hydrated, count]);
  return ideas;
}

// ─── Ambient orbs ─────────────────────────────────────────────────────────────

function AmbientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute -top-32 -left-20 size-[600px] rounded-full bg-gradient-radial from-accent/[0.08] to-transparent blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] -right-32 size-[500px] rounded-full bg-gradient-radial from-sky-400/[0.06] to-transparent blur-3xl"
        animate={{ x: [0, -25, 0], y: [0, 30, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />
      <motion.div
        className="absolute -bottom-20 left-1/3 size-[400px] rounded-full bg-gradient-radial from-blue-500/[0.06] to-transparent blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </div>
  );
}

// ─── Quick create bar ─────────────────────────────────────────────────────────

const homeQuickBarVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const homeQuickItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } },
};

const PROMPT_IDEAS_FALLBACK = [
  { label: "SaaS dashboard", prompt: TEMPLATES[0].prompt },
  { label: "AI chatbot", prompt: TEMPLATES[1].prompt },
  { label: "E-commerce", prompt: TEMPLATES[2].prompt },
];

function QuickCreateBar({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [modelId, setModelId] = React.useState(DEFAULT_MODEL_ID);
  const [buildStrategy, setBuildStrategy] = React.useState<BuildStrategy>("build_now");
  const [creating, setCreating] = React.useState(false);
  const [launchError, setLaunchError] = React.useState<string | null>(null);
  const planFirst = toggleFromBuildStrategy(buildStrategy);
  const complexPrompt = suggestBuildStrategy(value) === "plan_first" && value.trim().length > 0;
  const promptIdeas = useSessionComposerIdeas(6);

  React.useEffect(() => {
    if (!value.trim()) return;
    if (complexPrompt && !planFirst) {
      // Suggest only — do not force toggle.
    }
  }, [value, complexPrompt, planFirst]);

  async function launch(source: "button" | "enter" | "form") {
    const q = value.trim();
    if (process.env.NODE_ENV !== "production") {
      console.info("[home] launch", { source, chars: q.length, buildStrategy });
    }
    if (!q || creating) return;

    setLaunchError(null);
    onChange("");
    setCreating(true);

    const handoffId = storeAutostartHandoff(q, "build", { buildStrategy, modelId });

    try {
      const res = await fetch("/api/projects/start-from-home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: q,
          strategy: buildStrategy,
          selectedModel: modelId !== DEFAULT_MODEL_ID ? modelId : null,
          idempotencyKey: handoffId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        intent?: string;
        builderUrl?: string;
        discussUrl?: string;
        error?: string;
        userMessage?: string;
        projectId?: string;
      };

      if (!res.ok || data.ok === false) {
        const msg = data.userMessage ?? data.error ?? "Could not start your build. Try again.";
        setLaunchError(msg);
        onChange(q);
        setCreating(false);
        return;
      }

      if (data.intent === "question" && data.discussUrl) {
        storeAutostartHandoff(q, "discuss", { buildStrategy, modelId });
        router.push(data.discussUrl);
        return;
      }

      if (data.builderUrl && data.projectId) {
        router.push(data.builderUrl);
        return;
      }

      setLaunchError("Could not open the builder. Try again.");
      onChange(q);
      setCreating(false);
    } catch {
      setLaunchError("Network error — check your connection and try again.");
      onChange(q);
      setCreating(false);
    }
  }

  return (
    <motion.div
      variants={homeQuickBarVariants}
      initial="hidden"
      animate="show"
      className="relative z-10 w-full max-w-5xl 2xl:max-w-6xl"
    >
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          void launch("form");
        }}
        className="group relative overflow-hidden rounded-[1.5rem] border border-border/50 bg-background/90 shadow-[0_20px_56px_-28px_rgba(37,99,235,0.28)] ring-1 ring-border/40 transition-[border-color,box-shadow] focus-within:border-accent/30 focus-within:shadow-[0_24px_64px_-24px_rgba(37,99,235,0.35)]"
        data-testid="home-create-composer"
      >
        {creating ? (
          <div
            className="flex items-center gap-2 border-b border-border/40 bg-accent/5 px-4 py-2 text-[12px] font-medium text-accent"
            data-testid="home-creating-state"
          >
            <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            Creating workspace…
          </div>
        ) : null}
        {launchError ? (
          <p
            className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-[12px] text-destructive"
            data-testid="home-launch-error"
            role="alert"
          >
            {launchError}
          </p>
        ) : null}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[radial-gradient(ellipse_90%_80%_at_50%_100%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)]"
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-[15%] bottom-0 h-32 rounded-[100%] bg-accent/20 blur-3xl"
          animate={{ y: [12, -4, 12], scale: [1, 1.06, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div variants={homeQuickItem} className="relative flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
          <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[11.5px] font-semibold text-accent ring-1 ring-accent/20">
            <Zap className="size-3" strokeWidth={1.75} />
            Build
          </div>
          <p className="text-[11px] text-muted-foreground/60">Describe your app — we handle the rest</p>
        </motion.div>

        <motion.textarea
          variants={homeQuickItem}
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => applyComposerPaste(e, value, onChange)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (process.env.NODE_ENV !== "production") console.info("[home] enter pressed");
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="Describe the app you want to build…"
          rows={3}
          className="relative w-full resize-none appearance-none bg-transparent px-5 pb-1 pt-4 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/45 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        />

        <motion.div variants={homeQuickItem} className="relative flex flex-wrap items-center gap-2 px-4 pb-3">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground/55">Ideas:</span>
          {promptIdeas.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onChange(chip.prompt)}
              className="cursor-pointer rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-accent/35 hover:text-foreground"
            >
              {chip.label}
            </button>
          ))}
        </motion.div>

        <motion.div variants={homeQuickItem} className="relative flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <ModelPicker value={modelId} onChange={setModelId} placement="auto" compact />
            <PlanFirstToggle
              enabled={planFirst}
              onChange={(on) => setBuildStrategy(buildStrategyFromToggle(on))}
            />
            {complexPrompt && !planFirst ? (
              <p className="text-[10px] text-muted-foreground/80">
                This looks complex. Planning first is recommended.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-[11px] text-muted-foreground/55 sm:block">
              {planFirst ? "Enter to create plan" : "Enter to build"}
            </p>
            <button
              type="submit"
              disabled={!value.trim() || creating}
              onPointerDown={() => {
                if (process.env.NODE_ENV !== "production") console.info("[home] launch button clicked");
              }}
              className={cn(
                "relative z-20 flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition",
                value.trim() && !creating
                  ? "bg-foreground text-background shadow-md hover:opacity-90 active:scale-[0.97]"
                  : "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
              )}
              aria-label={planFirst ? "Create plan" : "Build app"}
              data-testid="home-build-submit"
            >
              {creating ? "Starting…" : planFirst ? "Create plan" : "Build"}
              <ArrowRight className="size-4" strokeWidth={2.25} />
            </button>
          </div>
        </motion.div>
      </form>
    </motion.div>
  );
}

// ─── App inspiration feed ─────────────────────────────────────────────────────

function AppInspirationFeed({ onPickPrompt }: { onPickPrompt: (prompt: string) => void }) {
  const [ripple, setRipple] = React.useState<string | null>(null);
  const inspirations = useSessionAppIdeas(6);

  return (
    <section className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-3.5 text-muted-foreground/60" strokeWidth={1.75} />
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            App ideas — build one now
          </span>
        </div>
        <Link
          href="/explore"
          className="flex cursor-pointer items-center gap-1 text-[11.5px] text-accent transition hover:underline"
        >
          Explore more <ArrowRight className="size-3" strokeWidth={2} />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inspirations.map((app, i) => (
          <motion.button
            key={app.label}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.04 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setRipple(app.label);
              window.setTimeout(() => {
                onPickPrompt(app.prompt);
                setRipple(null);
              }, 200);
            }}
            className={cn(
              "group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-xl p-4 text-left ring-1 ring-border transition hover:ring-accent/35 hover:shadow-lg bg-gradient-to-br",
              app.gradient,
            )}
          >
            {ripple === app.label && (
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-xl bg-white/30"
                initial={{ opacity: 0.5, scale: 0.88 }}
                animate={{ opacity: 0, scale: 1.18 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="mt-0.5 text-2xl leading-none shrink-0">{app.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">{app.label}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground line-clamp-2">{app.desc}</p>
            </div>
            <ArrowRight
              className="size-3.5 shrink-0 mt-1 text-foreground/25 transition group-hover:translate-x-0.5 group-hover:text-accent"
              strokeWidth={2}
            />
          </motion.button>
        ))}
      </div>
    </section>
  );
}

// ─── Platform stats bar ───────────────────────────────────────────────────────

function PlatformStats({ appCount }: { appCount: number }) {
  const credits = useCreditsStore((s) => s.remaining);
  const isConfirmed = useCreditsStore((s) => s.isConfirmed);
  const loading = useCreditsStore((s) => s.loading);
  const hydrated = useHydrated();

  return (
    <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground/70">
      <span className="flex items-center gap-1.5">
        <LayoutGrid className="size-3" strokeWidth={1.75} />
        {appCount} app{appCount !== 1 ? "s" : ""}
      </span>
      {hydrated && (
        <span className="flex items-center gap-1.5">
          <Zap className="size-3 text-accent/70" strokeWidth={1.75} />
          {isConfirmed ? `${credits} credits` : loading ? "Loading credits…" : "—"}
        </span>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.06 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export interface OsHomeProps {
  recentProjects: RecentProject[];
}

export function OsHome({ recentProjects }: OsHomeProps) {
  const searchParams = useSearchParams();
  const { profile, user } = useAuthStore();
  const display = resolveDisplayName(profile, user);
  const firstName = display !== "User" ? display.split(/\s+/)[0] : null;
  const greeting = useTimeGreeting();

  const [quickPrompt, setQuickPrompt] = React.useState("");
  const quickInputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const p = searchParams.get("prompt");
    if (p) setQuickPrompt(p);
  }, [searchParams]);

  function prefillCreateBar(prompt: string) {
    setQuickPrompt(prompt);
    requestAnimationFrame(() => {
      quickInputRef.current?.focus();
      quickInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="relative w-full min-w-0 flex-1">
      <AmbientOrbs />

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-[min(52vh,560px)] bg-[radial-gradient(95%_85%_at_50%_100%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_72%)]"
        aria-hidden
      />

      <div className="relative z-10 flex w-full min-w-0 flex-col items-center gap-12 px-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-10 sm:px-8 lg:px-12 xl:px-14 2xl:px-16 lg:pb-20">

        <motion.div
          variants={heroContainer}
          initial="hidden"
          animate="show"
          className="flex w-full max-w-5xl flex-col items-center text-center xl:max-w-6xl"
        >
          <motion.div
            className="relative w-full overflow-hidden rounded-[1.85rem] border border-accent/20 bg-background/80 px-6 py-10 shadow-[0_28px_72px_-32px_rgba(37,99,235,0.35)] ring-1 ring-accent/15 sm:px-12 sm:py-14"
            variants={heroItem}
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(ellipse_100%_90%_at_50%_100%,color-mix(in_oklab,var(--accent)_28%,transparent),transparent_68%)]"
              animate={{ opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-[10%] bottom-0 h-40 rounded-[100%] bg-sky-400/15 blur-3xl"
              animate={{ y: [16, -8, 16], scale: [1, 1.08, 1] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(ellipse_70%_45%_at_50%_0%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_60%)]"
            />
            <motion.p variants={heroItem} className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">
              DreamOS86
            </motion.p>
            <motion.h1
              variants={heroItem}
              className="relative mt-3 text-balance text-[28px] font-semibold tracking-[-0.04em] text-foreground sm:text-[36px] lg:text-[40px]"
            >
              {greeting}{firstName ? `, ${firstName}` : ""}.
            </motion.h1>
            <motion.p variants={heroItem} className="relative mt-2 text-pretty text-[15px] text-muted-foreground sm:text-[16px]">
              What are you building today?
            </motion.p>
            <motion.div variants={heroItem} className="relative mt-5 flex justify-center">
              <PlatformStats appCount={recentProjects.length} />
            </motion.div>
          </motion.div>
        </motion.div>

        <div className="w-full max-w-5xl 2xl:max-w-6xl">
          <QuickCreateBar value={quickPrompt} onChange={setQuickPrompt} inputRef={quickInputRef} />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mx-auto w-full max-w-5xl"
        >
          <YourAppsSection projects={recentProjects} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
          className="mx-auto w-full max-w-5xl"
        >
          <ModelUsageDonut />
        </motion.div>

        {/* App inspiration feed */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mx-auto w-full max-w-5xl"
        >
          <AppInspirationFeed onPickPrompt={prefillCreateBar} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="mx-auto w-full max-w-5xl"
        >
          <IntegrationShowcaseSection variant="default" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.24 }}
          className="mx-auto w-full max-w-5xl px-4 sm:px-0"
        >
          <WhyDreamOsSection />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.26 }}
          className="mx-auto w-full max-w-5xl px-4 sm:px-0"
        >
          <DreamOsStatsSection />
        </motion.div>

        {/* Platform quick links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex w-full max-w-4xl flex-wrap items-center justify-center gap-2"
        >
          {[
            { href: "/projects", icon: LayoutGrid, label: "All apps" },
            { href: "/community", icon: Users, label: "Community" },
            { href: "/templates", icon: Sparkles, label: "Templates" },
            { href: "/marketplace", icon: Globe, label: "Marketplace" },
            { href: "/pricing", icon: Rocket, label: "Upgrade" },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              prefetch
              className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition hover:bg-surface-raised hover:text-foreground hover:ring-accent/20"
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
