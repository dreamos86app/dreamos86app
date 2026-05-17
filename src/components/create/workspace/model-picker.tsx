"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Cpu,
  Gauge,
  ImageIcon,
  Layers,
  ChevronUp,
  Zap,
  Coins,
  Search,
  CheckCheck,
  Sparkles,
  Lock,
} from "lucide-react";
import type { CreationModel, Rating1to5, ModelSpecialization } from "@/lib/creation/models";
import { CREATION_MODELS } from "@/lib/creation/models";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  xai: "xAI",
  meta: "Meta",
  cohere: "Cohere",
  mistral: "Mistral",
};

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "bg-orange-500/10 text-orange-600",
  openai: "bg-emerald-500/10 text-emerald-600",
  google: "bg-blue-500/10 text-blue-600",
  deepseek: "bg-violet-500/10 text-violet-600",
  xai: "bg-red-500/10 text-red-600",
  meta: "bg-sky-500/10 text-sky-600",
  cohere: "bg-fuchsia-500/10 text-fuchsia-600",
  mistral: "bg-orange-400/10 text-orange-500",
};

const SPEC_BADGE: Record<ModelSpecialization, { label: string; color: string }> = {
  architecture: { label: "ARCHITECT", color: "bg-blue-500/10 text-blue-600 ring-blue-500/20" },
  frontend:     { label: "FRONTEND", color: "bg-violet-500/10 text-violet-600 ring-violet-500/20" },
  backend:      { label: "BACKEND ENGINE", color: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20" },
  fullstack:    { label: "FULL-STACK", color: "bg-accent/10 text-accent ring-accent/20" },
  analysis:     { label: "LONG CONTEXT", color: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20" },
  speed:        { label: "ULTRA FAST", color: "bg-amber-500/10 text-amber-600 ring-amber-500/20" },
  reasoning:    { label: "DEEP REASONER", color: "bg-pink-500/10 text-pink-600 ring-pink-500/20" },
  multimodal:   { label: "VISION", color: "bg-teal-500/10 text-teal-600 ring-teal-500/20" },
};

// ─── Rating dots ──────────────────────────────────────────────────────────────

function RatingDots({ value, max = 5 }: { value: Rating1to5; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i < value ? "bg-accent" : "bg-muted")} />
      ))}
    </span>
  );
}

// ─── Model row ────────────────────────────────────────────────────────────────

function ModelRow({
  model,
  active,
  onSelect,
  onHover,
}: {
  model: CreationModel;
  active: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const badge = SPEC_BADGE[model.specialization];

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(model.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition",
        active ? "bg-accent/10 ring-1 ring-accent/20" : "hover:bg-surface",
      )}
    >
      {/* Provider dot */}
      <span className="size-2 shrink-0 rounded-full mt-0.5" style={{ backgroundColor: model.accent }} />

      {/* Name + tagline */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] font-semibold text-foreground truncate">{model.name}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider ring-1", badge.color)}>
            {badge.label}
          </span>
          {active && <CheckCheck className="size-3 text-accent" strokeWidth={2} />}
        </div>
        <p className="mt-0.5 text-[10.5px] text-muted-foreground truncate">{model.tagline}</p>
      </div>

      {/* Context + credits */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", PROVIDER_COLOR[model.provider] ?? "bg-muted text-muted-foreground")}>
          {PROVIDER_LABELS[model.provider]}
        </span>
        <span className="text-[9.5px] text-muted-foreground/60 font-mono">
          {model.contextK >= 1000 ? `${model.contextK / 1000}M` : `${model.contextK}K`} · {model.credits}cr
        </span>
      </div>
    </button>
  );
}

// ─── Detail panel (shown on hover) ───────────────────────────────────────────

function ModelDetailPanel({ model }: { model: CreationModel }) {
  const r = model.ratings;
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute right-full top-0 mr-2 w-[240px] rounded-xl bg-background p-3.5 shadow-[var(--shadow-md)] ring-1 ring-border z-[10000]"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[12.5px] font-semibold text-foreground">{model.name}</p>
        {model.multimodal && (
          <span className="flex items-center gap-0.5 rounded-full bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-teal-600">
            <ImageIcon className="size-2.5" strokeWidth={1.75} /> Vision
          </span>
        )}
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground mb-2.5">
        {model.orchestrationRole}
      </p>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px]">
        {([
          ["Intelligence", r.intelligence, Brain],
          ["Reasoning", r.reasoning, Layers],
          ["Frontend", r.frontend, Cpu],
          ["Backend", r.backend, Cpu],
          ["Speed", r.speed, Gauge],
          ["Cost eff.", r.cost, Coins],
        ] as Array<[string, Rating1to5, React.ElementType]>).map(([label, val, Icon]) => (
          <div key={label} className="flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon className="size-2.5" strokeWidth={1.65} />
              {label}
            </span>
            <RatingDots value={val} />
          </div>
        ))}
      </div>

      <div className="mt-2.5 space-y-1">
        <p className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">Best for</p>
        {model.idealFor.slice(0, 3).map((u) => (
          <p key={u} className="flex items-start gap-1.5 text-[10.5px] text-foreground/80">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-accent" />
            {u}
          </p>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main picker ──────────────────────────────────────────────────────────────

interface DropdownPos { bottom: number; left: number; width: number }

export function ModelPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { profile } = useAuthStore();
  const isFree = !profile?.plan_id || profile.plan_id === "free";

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [pos, setPos] = React.useState<DropdownPos | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const current = CREATION_MODELS.find((m) => m.id === value) ?? CREATION_MODELS[0];

  // Free users always use auto-routing — show locked "Automatic" pill (hooks still called above)
  if (isFree) {
    return (
      <div className={cn("relative", className)}>
        <div className="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-[12px] font-medium text-muted-foreground ring-1 ring-border cursor-default select-none">
          <Sparkles className="size-3 text-accent/70" strokeWidth={1.75} />
          <span>Automatic</span>
          <span className="rounded-full bg-accent/10 px-1 py-0.5 text-[9px] font-bold text-accent">
            AUTO
          </span>
          <Lock className="size-3 text-muted-foreground/40 ml-0.5" strokeWidth={1.65} />
        </div>
      </div>
    );
  }

  React.useEffect(() => { setMounted(true); }, []);

  // Position UPWARD from trigger
  const updatePos = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
      width: 340,
    });
  }, []);

  React.useEffect(() => {
    if (!open) { setQuery(""); return; }
    updatePos();
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [open, updatePos]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Reposition on scroll/resize
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => { window.removeEventListener("scroll", updatePos, true); window.removeEventListener("resize", updatePos); };
  }, [open, updatePos]);

  const filtered = CREATION_MODELS.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.specialization.toLowerCase().includes(q) ||
      m.tagline.toLowerCase().includes(q)
    );
  });

  const hovered = hoverId ? CREATION_MODELS.find((m) => m.id === hoverId) : null;

  const dropdown = pos && mounted ? createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dropRef}
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "fixed",
            bottom: pos.bottom,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
          className="overflow-visible rounded-[var(--radius-xl)] bg-background shadow-[0_-16px_40px_-8px_rgba(0,0,0,0.2)] ring-1 ring-border"
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-muted-foreground/50 hover:text-foreground text-[10px]">
                ✕
              </button>
            )}
          </div>

          {/* Model list */}
          <div className="relative max-h-[320px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">No models match &ldquo;{query}&rdquo;</p>
            ) : (
              filtered.map((m) => {
                return (
                  <div key={m.id} className="relative">
                    <ModelRow
                      model={m}
                      active={m.id === value}
                      onSelect={() => { onChange(m.id); setOpen(false); }}
                      onHover={setHoverId}
                    />
                    <AnimatePresence>
                      {hovered?.id === m.id && <ModelDetailPanel model={m} />}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground/50">
            Hover to see orchestration role · Click to select agent
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  ) : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-[12px] font-medium text-foreground ring-1 ring-border transition hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <span className="size-1.5 rounded-full" style={{ backgroundColor: current.accent }} />
        <span className="max-w-[100px] truncate">{current.name}</span>
        <span className={cn("rounded-full px-1 py-0.5 text-[9px] font-bold tracking-wide ring-1", SPEC_BADGE[current.specialization].color)}>
          {SPEC_BADGE[current.specialization].label.split(" ")[0]}
        </span>
        <ChevronUp
          className={cn("size-3 text-muted-foreground transition-transform", !open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
      {dropdown}
    </div>
  );
}
