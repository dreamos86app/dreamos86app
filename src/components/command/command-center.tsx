"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  LayoutGrid,
  LayoutTemplate,
  Compass,
  Rocket,
  Store,
  BarChart3,
  Users,
  Settings2,
  HelpCircle,
  ScrollText,
  Gift,
  MessageSquare,
  ArrowRight,
  Zap,
  Globe,
  Key,
  CreditCard,
  Moon,
  Sun,
  LogOut,
  Building,
  Plus,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { runFullSignOut } from "@/lib/auth/sign-out-client";

// ─── Command item types ───────────────────────────────────────────────────────

type CommandGroup = {
  label: string;
  items: CommandItem[];
};

type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
};

// ─── Command Center hook ──────────────────────────────────────────────────────

type CommandCenterState = {
  open: boolean;
  openCommandCenter: () => void;
  closeCommandCenter: () => void;
  toggleCommandCenter: () => void;
};

// Singleton event bus for Cmd+K
const listeners = new Set<(open: boolean) => void>();
let _open = false;

function notifyListeners(open: boolean) {
  _open = open;
  for (const l of listeners) l(open);
}

export function useCommandCenter(): CommandCenterState {
  const [open, setOpen] = React.useState(_open);

  React.useEffect(() => {
    listeners.add(setOpen);
    return () => { listeners.delete(setOpen); };
  }, []);

  return {
    open,
    openCommandCenter: () => notifyListeners(true),
    closeCommandCenter: () => notifyListeners(false),
    toggleCommandCenter: () => notifyListeners(!_open),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommandCenter() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  // Subscribe to singleton
  React.useEffect(() => {
    listeners.add(setOpen);
    return () => { listeners.delete(setOpen); };
  }, []);

  // Global Cmd+K / Ctrl+K listener
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        notifyListeners(!_open);
      }
      if (e.key === "Escape" && _open) {
        notifyListeners(false);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function navigate(path: string) {
    notifyListeners(false);
    router.push(path);
  }

  const groups: CommandGroup[] = [
    {
      label: "Create",
      items: [
        {
          id: "new-app",
          label: "New app",
          description: "Start building with AI",
          icon: Plus,
          shortcut: "N",
          action: () => navigate("/"),
          keywords: ["build", "create", "new", "app", "project"],
        },
        {
          id: "workspace",
          label: "Open workspace",
          description: "AI creation workspace",
          icon: Sparkles,
          action: () => navigate("/"),
          keywords: ["workspace", "chat", "ai"],
        },
      ],
    },
    {
      label: "Navigate",
      items: [
        { id: "apps", label: "My Apps", description: "All your projects", icon: LayoutGrid, action: () => navigate("/projects"), keywords: ["projects", "apps"] },
        { id: "templates", label: "Templates", description: "Start from a foundation", icon: LayoutTemplate, action: () => navigate("/templates"), keywords: ["template", "starter"] },
        { id: "explore", label: "Explore", description: "Discover community builds", icon: Compass, action: () => navigate("/explore"), keywords: ["discover", "explore", "browse"] },
        { id: "chat", label: "AI Chat", description: "Talk to any model", icon: MessageSquare, action: () => navigate("/chat"), keywords: ["chat", "message", "model"] },
        { id: "deploy", label: "Deploy", description: "Deployment center", icon: Rocket, action: () => navigate("/deploy"), keywords: ["deploy", "ship", "release"] },
        { id: "marketplace", label: "Marketplace", description: "Extensions and plugins", icon: Store, action: () => navigate("/marketplace"), keywords: ["marketplace", "plugin", "extension"] },
        { id: "community", label: "Community", description: "Forums and showcases", icon: Users, action: () => navigate("/community"), keywords: ["community", "forum", "social"] },
        { id: "analytics", label: "Analytics", description: "Usage and insights", icon: BarChart3, action: () => navigate("/analytics"), keywords: ["analytics", "usage", "stats"] },
      ],
    },
    {
      label: "Settings",
      items: [
        { id: "settings", label: "Settings", description: "Workspace preferences", icon: Settings2, action: () => navigate("/settings"), keywords: ["settings", "preferences"] },
        { id: "api-keys", label: "API Keys", description: "Manage access keys", icon: Key, action: () => navigate("/settings/api-keys"), keywords: ["api", "keys", "token"] },
        { id: "billing", label: "Billing", description: "Subscription and usage", icon: CreditCard, action: () => navigate("/settings/billing"), keywords: ["billing", "subscription", "plan"] },
        { id: "referrals", label: "Referrals", description: "Invite and earn credits", icon: Gift, action: () => navigate("/referrals"), keywords: ["referral", "invite", "share"] },
        { id: "integrations", label: "Integrations", description: "Connect services", icon: Globe, action: () => navigate("/settings/integrations"), keywords: ["github", "vercel", "stripe"] },
      ],
    },
    {
      label: "Actions",
      items: [
        {
          id: "theme",
          label: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
          icon: resolvedTheme === "dark" ? Sun : Moon,
          action: () => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); notifyListeners(false); },
          keywords: ["theme", "dark", "light", "appearance"],
        },
        { id: "help", label: "Help Center", description: "Docs and guides", icon: HelpCircle, action: () => navigate("/help"), keywords: ["help", "docs", "guide"] },
        { id: "changelog", label: "Changelog", description: "What's new", icon: ScrollText, action: () => navigate("/changelog"), keywords: ["changelog", "updates", "new"] },
        {
          id: "logout",
          label: "Sign out",
          icon: LogOut,
          action: () => {
            notifyListeners(false);
            void runFullSignOut();
          },
          keywords: ["logout", "sign out", "exit"],
        },
      ],
    },
  ];

  // Filter groups based on query
  const filteredGroups = React.useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description?.toLowerCase().includes(q) ||
            item.keywords?.some((k) => k.includes(q)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, resolvedTheme]);

  // Flat list for keyboard navigation
  const flatItems = React.useMemo(
    () => filteredGroups.flatMap((g) => g.items),
    [filteredGroups],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flatItems[selectedIdx]?.action();
    }
  }

  // Reset selection when query changes
  React.useEffect(() => { setSelectedIdx(0); }, [query]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-[2px]"
            onClick={() => notifyListeners(false)}
          />

          {/* Panel */}
          <div className="fixed inset-x-0 top-[20vh] z-[9991] flex justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[580px] overflow-hidden rounded-2xl bg-background shadow-[0_24px_64px_-12px_rgba(0,0,0,0.4)] ring-1 ring-border"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search commands, pages, settings…"
                  className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
                <kbd className="hidden rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border sm:inline">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[420px] overflow-y-auto py-2 scrollbar-none">
                {filteredGroups.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    No results for &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.label}>
                      <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                        {group.label}
                      </p>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const globalIdx = flatItems.indexOf(item);
                        const selected = selectedIdx === globalIdx;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={item.action}
                            onMouseEnter={() => setSelectedIdx(globalIdx)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2 text-left transition",
                              selected ? "bg-accent/8" : "hover:bg-surface/50",
                            )}
                          >
                            <div className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-lg transition",
                              selected ? "bg-accent/15 text-accent" : "bg-surface text-muted-foreground",
                            )}>
                              <Icon className="size-3.5" strokeWidth={1.75} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "text-[13px] font-medium",
                                selected ? "text-foreground" : "text-foreground/80",
                              )}>
                                {item.label}
                              </p>
                              {item.description && (
                                <p className="text-[11.5px] text-muted-foreground">{item.description}</p>
                              )}
                            </div>
                            {item.shortcut && (
                              <kbd className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border">
                                {item.shortcut}
                              </kbd>
                            )}
                            {selected && (
                              <ArrowRight className="size-3.5 shrink-0 text-accent/60" strokeWidth={2} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center gap-3 border-t border-border px-4 py-2">
                <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/50">
                  <kbd className="rounded bg-surface px-1 py-0.5 font-mono ring-1 ring-border">↑↓</kbd>
                  navigate
                </div>
                <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/50">
                  <kbd className="rounded bg-surface px-1 py-0.5 font-mono ring-1 ring-border">↵</kbd>
                  select
                </div>
                <div className="ml-auto flex items-center gap-1 text-[10.5px] text-muted-foreground/40">
                  <Zap className="size-3 text-accent/50" strokeWidth={1.75} />
                  DreamOS86
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
