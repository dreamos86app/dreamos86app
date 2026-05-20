"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Sparkles,
  Plus,
  LayoutGrid,
  MessageCircle,
  Pencil,
  TrendingUp,
  Users,
  Rocket,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IntegrationShowcaseSection } from "@/components/marketing/integrations-showcase";
import { DreamOsStatsSection } from "@/components/os-home/dreamos-stats-section";
import { WhyDreamOsSection } from "@/components/os-home/why-dreamos-section";
import { YourAppsSection } from "@/components/os-home/your-apps-section";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { resolveDisplayName } from "@/lib/profile-display";
import type { CreationMode } from "@/lib/creation/models";
import { applyComposerPaste } from "@/lib/composer/textarea-handlers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentProject {
  id: string;
  name: string;
  gradient: string;
  status: string;
  updated_at: string;
  preview_url: string | null;
  icon_url: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GREETING = (() => {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Night owl mode";
})();

const TEMPLATES = [
  { label: "SaaS Dashboard", prompt: "Build a premium SaaS dashboard with analytics, team management, billing, and role-based access control.", icon: "📊", gradient: "from-blue-500/20 to-violet-500/20" },
  { label: "AI Chatbot", prompt: "Create a production-grade AI chatbot platform with streaming responses, conversation history, and model selection.", icon: "🤖", gradient: "from-violet-500/20 to-pink-500/20" },
  { label: "E-commerce", prompt: "Build a modern e-commerce platform with product catalog, cart, checkout, Stripe payments, and order tracking.", icon: "🛍️", gradient: "from-emerald-500/20 to-cyan-500/20" },
  { label: "Social App", prompt: "Create a social platform with profiles, real-time feed, following, likes, comments, and notifications.", icon: "💬", gradient: "from-amber-500/20 to-orange-500/20" },
  { label: "Portfolio", prompt: "Build a stunning developer portfolio with animated hero, project showcase, skills section, and contact form.", icon: "✨", gradient: "from-pink-500/20 to-rose-500/20" },
  { label: "CRM", prompt: "Create an AI-powered CRM with contact management, deal pipeline, activity tracking, and automated follow-ups.", icon: "📋", gradient: "from-cyan-500/20 to-blue-500/20" },
];

const MODES: Array<{ id: CreationMode; label: string; desc: string; icon: React.ElementType; accent: string }> = [
  { id: "discuss", label: "Discuss", desc: "Plan, explore, debug", icon: MessageCircle, accent: "text-blue-500" },
  { id: "edit", label: "Edit", desc: "Surgical precision", icon: Pencil, accent: "text-amber-500" },
  { id: "build", label: "Build", desc: "Full system generation", icon: Zap, accent: "text-violet-500" },
];

// Real app ideas — inspiration feed with concrete, relatable prompts
const APP_INSPIRATIONS = [
  { label: "Personal finance tracker", desc: "Budgets, goals, spending trends, and alerts", gradient: "from-emerald-500/15 to-green-500/15", icon: "💰", prompt: "Build a personal finance tracker with budget categories, monthly goals, spending trends, and automated alerts when you overspend." },
  { label: "Gym motivation app", desc: "Workout streaks, progress photos, and PRs", gradient: "from-violet-500/15 to-indigo-500/15", icon: "💪", prompt: "Create a gym motivation app with workout streaks, personal record tracking, progress photo timeline, and weekly achievement badges." },
  { label: "Restaurant inventory OS", desc: "Stock tracking, waste reduction, supplier alerts", gradient: "from-amber-500/15 to-orange-500/15", icon: "🍽️", prompt: "Build a restaurant inventory management system with stock tracking, waste reduction analytics, low-stock alerts, and automated supplier ordering." },
  { label: "Social profile app", desc: "Profiles, posts, likes, comments, and follows", gradient: "from-pink-500/15 to-rose-500/15", icon: "💬", prompt: "Create a social app with user profiles, a real-time post feed, likes, comments, follow/unfollow, and push notifications." },
  { label: "Salon & clinic booking", desc: "Staff calendars, slots, and client reminders", gradient: "from-cyan-500/15 to-blue-500/15", icon: "💇", prompt: "Build a booking platform for a salon or clinic with staff calendars, real-time slot availability, client SMS reminders, and cancellation management." },
  { label: "AI chatbot platform", desc: "Saved conversations, model selection, history", gradient: "from-blue-500/15 to-violet-500/15", icon: "🤖", prompt: "Build an AI chatbot platform with multiple model support, persistent conversation history, folder organization, and custom system prompts." },
];

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

const PROMPT_IDEAS = [
  { label: "SaaS dashboard", prompt: TEMPLATES[0].prompt },
  { label: "AI chatbot", prompt: TEMPLATES[1].prompt },
  { label: "E-commerce", prompt: TEMPLATES[2].prompt },
  { label: "Finance tracker", prompt: APP_INSPIRATIONS[0].prompt },
  { label: "Booking system", prompt: APP_INSPIRATIONS[4].prompt },
  { label: "Social app", prompt: APP_INSPIRATIONS[3].prompt },
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
  const [mode, setMode] = React.useState<CreationMode>("build");
  const formRef = React.useRef<HTMLFormElement>(null);

  function launch(source: "button" | "enter" | "form") {
    const q = value.trim();
    if (process.env.NODE_ENV !== "production") {
      console.info("[home] launch", { source, chars: q.length });
    }
    if (!q) return;
    router.push(
      `/create?prompt=${encodeURIComponent(q)}&mode=${mode}&autostart=1`,
    );
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
          launch("form");
        }}
        className="group relative overflow-hidden rounded-[1.5rem] border border-border/50 bg-background/90 shadow-[0_24px_64px_-28px_rgba(37,99,235,0.45)] ring-1 ring-border/40 transition-[border-color,box-shadow] focus-within:border-accent/30 focus-within:shadow-[0_32px_80px_-24px_rgba(37,99,235,0.5)]"
      >
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
        <motion.div variants={homeQuickItem} className="relative flex items-center gap-1 border-b border-border/40 px-3 py-2.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium transition",
                  mode === m.id
                    ? "bg-accent/12 text-accent ring-1 ring-accent/25"
                    : "text-muted-foreground hover:bg-surface/80 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-3", mode === m.id ? "text-accent" : m.accent)} strokeWidth={1.75} />
                {m.label}
              </button>
            );
          })}
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
          placeholder="Describe the app you want to create…"
          rows={3}
          className="relative w-full resize-none appearance-none bg-transparent px-5 pb-1 pt-4 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/45 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        />

        <motion.div variants={homeQuickItem} className="relative flex flex-wrap items-center gap-2 px-4 pb-3">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground/55">Ideas:</span>
          {PROMPT_IDEAS.map((chip) => (
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

        <motion.div variants={homeQuickItem} className="relative flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3">
          <p className="text-[11px] text-muted-foreground/55">Enter to launch · Shift+Enter for new line</p>
          <button
            type="submit"
            aria-disabled={!value.trim()}
            onPointerDown={() => {
              if (process.env.NODE_ENV !== "production") console.info("[home] launch button clicked");
            }}
            onClick={() => {
              if (!value.trim() && process.env.NODE_ENV !== "production") {
                console.info("[home] launch blocked: empty");
              }
            }}
            className={cn(
              "relative z-20 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition",
              value.trim()
                ? "bg-foreground text-background shadow-lg hover:opacity-90 active:scale-[0.97]"
                : "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
            )}
            aria-label="Launch"
          >
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </button>
        </motion.div>
      </form>
    </motion.div>
  );
}

// ─── App inspiration feed ─────────────────────────────────────────────────────

function AppInspirationFeed({ onPickPrompt }: { onPickPrompt: (prompt: string) => void }) {
  const [ripple, setRipple] = React.useState<string | null>(null);

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
        {APP_INSPIRATIONS.map((app, i) => (
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
          {credits} credits
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
              {GREETING}{firstName ? `, ${firstName}` : ""}.
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
          <IntegrationShowcaseSection variant="premium" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.23 }}
          className="mx-auto w-full max-w-5xl"
        >
          <WhyDreamOsSection />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.24 }}
          className="mx-auto w-full max-w-5xl"
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
