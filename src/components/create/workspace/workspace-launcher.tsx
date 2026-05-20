"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Zap,
  CreditCard,
  Settings,
  HelpCircle,
  LayoutGrid,
  TrendingUp,
  Rocket,
  Home,
  Monitor,
  Code2,
  Globe,
  Plug,
  KeyRound,
  ScrollText,
  MessageCircle,
  LogOut,
  Boxes,
  Gift,
  ScrollText as ChangelogIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { IntegrationIcon } from "@/components/brand/integration-icons";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { resolveDisplayName } from "@/lib/profile-display";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FREE_MONTHLY_QUOTA } from "@/lib/stores/credits-store";
import { PublishModal, type PublishUiState } from "@/components/create/workspace/publish-modal";
import {
  WorkspaceIntegrationsModal,
  type IntegrationPreset,
} from "@/components/create/workspace/workspace-integrations-modal";
import { LogoIcon } from "@/components/ui/logo-icon";
import { toast } from "@/lib/toast";

export type WorkspaceRightTab = "preview" | "dashboard" | "code";

export type LauncherProject = {
  id: string;
  name: string;
  icon_url: string | null;
  gradient: string;
  preview_url: string | null;
  metadata: unknown;
  status?: string | null;
};

function CreditRing({
  used,
  limit,
  size = 40,
  center,
}: {
  used: number;
  limit: number;
  size?: number;
  center?: React.ReactNode;
}) {
  const pct = Math.min(1, limit > 0 ? used / limit : 0);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeDasharray={`${dash} ${circ}`}
          className="text-accent transition-all duration-500"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center [&>*]:pointer-events-auto">
        {center}
      </div>
    </div>
  );
}

interface PlatformDropdownProps {
  onClose: () => void;
  anchorRect: DOMRect | null;
}

function PlatformDropdown({ onClose, anchorRect }: PlatformDropdownProps) {
  if (!anchorRect) return null;

  const top = anchorRect.bottom + 8;
  const left = Math.min(anchorRect.left, typeof window !== "undefined" ? window.innerWidth - 240 : anchorRect.left);

  const links = [
    { href: "/", label: "Home", icon: Home },
    { href: "/projects", label: "Apps", icon: Boxes },
    { href: "/chat", label: "AI Chat", icon: MessageCircle },
    { href: "/changelog", label: "Changelog", icon: ChangelogIcon },
    { href: "/help", label: "Help", icon: HelpCircle },
    { href: "/settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <motion.div
      data-platform-dropdown="true"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "fixed", top, left, zIndex: 10000, width: 220 }}
      className="overflow-hidden rounded-2xl bg-background p-1.5 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.35)] ring-1 ring-border"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DreamOS86</p>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-foreground transition hover:bg-surface"
        >
          <Icon className="size-3.5 shrink-0 text-accent" strokeWidth={1.65} />
          {label}
        </Link>
      ))}
    </motion.div>
  );
}

interface WorkspaceDropdownProps {
  onClose: () => void;
  anchorRect: DOMRect | null;
  workspaceIconUrl: string | null;
  workspaceInitial: string;
  workspaceLabel: string;
}

function WorkspaceDropdown({
  onClose,
  anchorRect,
  workspaceIconUrl,
  workspaceInitial,
  workspaceLabel,
}: WorkspaceDropdownProps) {
  const router = useRouter();
  const supabase = createClient();
  const { profile, user, reset } = useAuthStore();
  const remaining = useCreditsStore((s) => s.remaining);
  const hydrated = useHydrated();
  const launcherName = resolveDisplayName(profile, user);

  const plan = profile?.plan_id ?? "free";
  const planLabel = plan === "free" ? "Free" : plan.charAt(0).toUpperCase() + plan.slice(1);
  const planQuota = plan === "free" ? FREE_MONTHLY_QUOTA : plan === "pro" ? 25000 : plan === "business" ? 100000 : 10000;
  const FREE_QUOTA = planQuota;
  const used = Math.max(0, FREE_QUOTA - remaining);

  const ringCenter = workspaceIconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={workspaceIconUrl} alt="" className="size-6 rounded-lg object-cover ring-1 ring-border" />
  ) : (
    <span className="flex size-6 items-center justify-center rounded-lg bg-accent/15 text-[10px] font-bold text-accent ring-1 ring-border">
      {workspaceInitial}
    </span>
  );

  if (!anchorRect) return null;

  const top = anchorRect.bottom + 8;
  const left = Math.min(anchorRect.left, typeof window !== "undefined" ? window.innerWidth - 308 : anchorRect.left);

  const panel = (
      <motion.div
      data-workspace-dropdown="true"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "fixed",
        top,
        left: Math.max(8, Math.min(left, typeof window !== "undefined" ? window.innerWidth - 304 : left)),
        zIndex: 10000,
        width: 296,
        maxHeight: "min(85vh, 520px)",
      }}
      className="flex flex-col overflow-hidden rounded-2xl bg-background shadow-[0_24px_64px_-12px_rgba(15,23,42,0.35)] ring-1 ring-border"
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div className="border-b border-border/80 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dream Space</p>
        <p className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{workspaceLabel}</p>
      </motion.div>
      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={launcherName}
              className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/50 to-violet-500/50 text-[14px] font-bold text-white">
              {launcherName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{launcherName}</p>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                {planLabel}
              </span>
              <span className="truncate text-[10.5px] text-muted-foreground/80">{profile?.email ?? ""}</span>
            </div>
          </div>
        </div>
      </div>

      {hydrated && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Credits</p>
            <Link
              href="/credits"
              onClick={onClose}
              className="flex items-center gap-1 text-[10.5px] font-medium text-accent hover:underline underline-offset-2"
            >
              <TrendingUp className="size-3" strokeWidth={1.75} />
              Usage
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <CreditRing used={used} limit={FREE_QUOTA} size={44} center={ringCenter} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold tabular-nums text-foreground">
                {remaining.toLocaleString()}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  / {FREE_QUOTA.toLocaleString()}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">This month</p>
            </div>
          </div>
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                remaining / FREE_QUOTA < 0.2 ? "bg-destructive/70" : "bg-accent",
              )}
              style={{ width: `${Math.min(100, (remaining / FREE_QUOTA) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-1.5">
        <Link
          href="/projects"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-foreground transition hover:bg-surface"
        >
          <LayoutGrid className="size-3.5 shrink-0 text-accent" strokeWidth={1.65} />
          Your apps
        </Link>
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
        >
          <Settings className="size-3.5 shrink-0" strokeWidth={1.65} />
          Account & settings
        </Link>
        <Link
          href="/settings/billing"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
        >
          <CreditCard className="size-3.5 shrink-0" strokeWidth={1.65} />
          Billing
        </Link>
        <Link
          href="/referrals"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
        >
          <Gift className="size-3.5 shrink-0" strokeWidth={1.65} />
          Referrals
        </Link>
        <Link
          href="/help"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
        >
          <HelpCircle className="size-3.5 shrink-0" strokeWidth={1.65} />
          Help
        </Link>
        <button
          type="button"
          onClick={async () => {
            onClose();
            await supabase.auth.signOut().catch(() => {});
            reset();
            router.push("/auth/login");
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
        >
          <LogOut className="size-3.5 shrink-0" strokeWidth={1.65} />
          Log out
        </button>
      </div>

    </motion.div>
  );

  return panel;
}

function readPublishDraft(metadata: unknown): PublishUiState | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const pu = (metadata as Record<string, unknown>).publish_ui;
  if (!pu || typeof pu !== "object" || Array.isArray(pu)) return null;
  return pu as PublishUiState;
}

export function WorkspaceLauncher({
  project,
  generationActive: _generationActive,
  isBusy,
  planId,
  onRightTab,
  onAppSection,
}: {
  project: LauncherProject | null;
  generationActive: boolean;
  isBusy: boolean;
  planId?: string;
  rightTab?: WorkspaceRightTab;
  onRightTab: (t: WorkspaceRightTab) => void;
  onAppSection: (section: string) => void;
}) {
  const { profile, user } = useAuthStore();
  const [platformMenuOpen, setPlatformMenuOpen] = React.useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false);
  const [appMenuOpen, setAppMenuOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishDraft, setPublishDraft] = React.useState<PublishUiState | null>(null);
  const [platformRect, setPlatformRect] = React.useState<DOMRect | null>(null);
  const [wsRect, setWsRect] = React.useState<DOMRect | null>(null);
  const [appRect, setAppRect] = React.useState<DOMRect | null>(null);
  const mounted = useHydrated();
  const [integrationOpen, setIntegrationOpen] = React.useState<IntegrationPreset | null>(null);
  const wsRef = React.useRef<HTMLButtonElement>(null);
  const logoRef = React.useRef<HTMLButtonElement>(null);
  const appRef = React.useRef<HTMLButtonElement>(null);

  const closeAllMenus = React.useCallback(() => {
    setPlatformMenuOpen(false);
    setWorkspaceMenuOpen(false);
    setAppMenuOpen(false);
  }, []);

  const workspaceName = (() => {
    const dn = resolveDisplayName(profile, user);
    if (dn && dn !== "User") return `${dn.split(/\s+/)[0]}'s workspace`;
    return profile?.email?.split("@")[0] ?? "Workspace";
  })();

  const workspaceIconUrl = profile?.workspace_icon_url ?? null;
  const workspaceLabel = profile?.workspace_name?.trim() || workspaceName;
  const workspaceInitial = workspaceLabel.charAt(0).toUpperCase();

  React.useEffect(() => {
    setPublishDraft(readPublishDraft(project?.metadata));
  }, [project?.metadata]);

  React.useEffect(() => {
    if (!platformMenuOpen && !workspaceMenuOpen && !appMenuOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Element;
      const inPlatform =
        logoRef.current?.contains(target) || !!target.closest("[data-platform-dropdown]");
      const inWs =
        wsRef.current?.contains(target) || !!target.closest("[data-workspace-dropdown]");
      const inApp = appRef.current?.contains(target) || !!target.closest("[data-app-dropdown]");
      if (!inPlatform) setPlatformMenuOpen(false);
      if (!inWs) setWorkspaceMenuOpen(false);
      if (!inApp) setAppMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [platformMenuOpen, workspaceMenuOpen, appMenuOpen]);

  React.useEffect(() => {
    if (!platformMenuOpen && !workspaceMenuOpen && !appMenuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAllMenus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [platformMenuOpen, workspaceMenuOpen, appMenuOpen, closeAllMenus]);

  const appTitle = project?.name ?? "New build";
  const showAppMenu = Boolean(project?.id);
  const publishReady = Boolean(project?.id && (project.icon_url || project.preview_url));
  const appInitial = (project?.name ?? "A").charAt(0).toUpperCase();

  const appSections: Array<{ id: string; label: string; icon: React.ElementType; tab?: WorkspaceRightTab }> = [
    { id: "preview", label: "Preview", icon: Monitor, tab: "preview" },
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid, tab: "dashboard" },
    { id: "code", label: "Code", icon: Code2, tab: "code" },
    { id: "publish", label: "Publish", icon: Rocket },
    { id: "settings", label: "App settings", icon: Settings },
    { id: "domains", label: "Domains", icon: Globe },
    { id: "integrations", label: "Integrations", icon: Plug },
    { id: "secrets", label: "Secrets", icon: KeyRound },
    { id: "logs", label: "Logs", icon: ScrollText },
  ];

  function handleAppNav(id: string, tab?: WorkspaceRightTab) {
    setAppMenuOpen(false);
    if (id === "publish") {
      setPublishOpen(true);
      return;
    }
    if (tab) {
      onRightTab(tab);
      onAppSection(id);
      return;
    }
    toast.info(
      "Coming soon — needs app management APIs wired to Supabase (domains, integrations, secrets, logs).",
    );
    onAppSection(id);
  }

  const dropdownPlatform = mounted ? (
    <AnimatePresence>
      {platformMenuOpen && (
        <PlatformDropdown onClose={() => setPlatformMenuOpen(false)} anchorRect={platformRect} />
      )}
    </AnimatePresence>
  ) : null;

  const dropdownWs = mounted ? (
    <AnimatePresence>
      {workspaceMenuOpen && (
        <WorkspaceDropdown
          onClose={() => setWorkspaceMenuOpen(false)}
          anchorRect={wsRect}
          workspaceIconUrl={workspaceIconUrl}
          workspaceInitial={workspaceInitial}
          workspaceLabel={workspaceLabel}
        />
      )}
    </AnimatePresence>
  ) : null;

  const dropdownApp = mounted ? (
    <AnimatePresence>
      {appMenuOpen && appRect && (
        <motion.div
          data-app-dropdown
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          style={{
            position: "fixed",
            top: appRect.bottom + 8,
            left: Math.min(appRect.left, typeof window !== "undefined" ? window.innerWidth - 280 : appRect.left),
            zIndex: 10000,
            width: 268,
          }}
          className="max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl bg-background py-1 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.35)] ring-1 ring-border"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {project?.name ?? "App"}
          </p>
          {appSections.map((row) => {
            const Icon = row.icon;
            const disabledDash = row.id === "dashboard" && !project?.id;
            return (
              <button
                key={row.id}
                type="button"
                disabled={disabledDash}
                onClick={() => !disabledDash && handleAppNav(row.id, row.tab)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition",
                  disabledDash
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : "text-foreground hover:bg-surface",
                )}
              >
                <Icon className="size-3.5 shrink-0 opacity-70" strokeWidth={1.65} />
                {row.label}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  ) : null;

  return (
    <>
      <div className="flex min-h-[56px] shrink-0 items-center gap-3 border-b border-border/60 bg-gradient-to-r from-accent/[0.06] via-background to-background px-3 py-2 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
            ref={logoRef}
            type="button"
            onClick={() => {
              setWorkspaceMenuOpen(false);
              setAppMenuOpen(false);
              if (!platformMenuOpen && logoRef.current) {
                setPlatformRect(logoRef.current.getBoundingClientRect());
              }
              setPlatformMenuOpen((v) => !v);
            }}
            className="group flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/90 p-1.5 ring-1 ring-border/50 transition hover:bg-surface hover:ring-accent/25"
            aria-label="DreamOS86 platform menu"
            aria-expanded={platformMenuOpen}
          >
            <LogoIcon size={28} className="opacity-95 transition group-hover:opacity-100" />
          </button>

          {showAppMenu ? (
            <button
              ref={appRef}
              type="button"
              onClick={() => {
                setPlatformMenuOpen(false);
                setWorkspaceMenuOpen(false);
                if (!appMenuOpen && appRef.current) {
                  setAppRect(appRef.current.getBoundingClientRect());
                }
                setAppMenuOpen((v) => !v);
              }}
              className={cn(
                "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background shadow-md ring-2 transition",
                appMenuOpen ? "ring-accent/40" : "ring-accent/15 hover:ring-accent/30",
              )}
              aria-label={`${appTitle} app menu`}
              aria-expanded={appMenuOpen}
            >
              {project?.icon_url ? (
                <Image src={project.icon_url} alt="" width={40} height={40} className="size-full object-cover" unoptimized />
              ) : (
                <span
                  className={cn(
                    "flex size-full items-center justify-center bg-gradient-to-br text-[14px] font-bold text-white",
                    project?.gradient ?? "from-accent/50 to-violet-500/50",
                  )}
                >
                  {appInitial}
                </span>
              )}
            </button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                ref={wsRef}
                type="button"
                onClick={() => {
                  setPlatformMenuOpen(false);
                  setAppMenuOpen(false);
                  if (!workspaceMenuOpen && wsRef.current) {
                    setWsRect(wsRef.current.getBoundingClientRect());
                  }
                  setWorkspaceMenuOpen((v) => !v);
                }}
                className="inline-flex max-w-full items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground"
                aria-label="Dream Space workspace menu"
                aria-expanded={workspaceMenuOpen}
              >
                <span className="truncate">{workspaceLabel}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" strokeWidth={2} />
              </button>
            </div>
            <p className="truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-[16px]">{appTitle}</p>
          </div>
        </div>

        <motion.div layout={false} className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => setIntegrationOpen("supabase")}
              className="rounded-xl p-2 text-muted-foreground ring-1 ring-border/60 transition hover:bg-surface hover:text-foreground"
              title="Connect Supabase"
            >
              <IntegrationIcon provider="supabase" size={18} title="Supabase" />
            </button>
            <button
              type="button"
              onClick={() => setIntegrationOpen("github")}
              className="rounded-xl p-2 text-muted-foreground ring-1 ring-border/60 transition hover:bg-surface hover:text-foreground"
              title="Connect GitHub"
            >
              <IntegrationIcon provider="github" size={18} title="GitHub" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              setPublishOpen(true);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition active:scale-[0.98]",
              publishReady
                ? "bg-accent text-white shadow-[0_6px_20px_-6px_rgba(37,99,235,0.55)] hover:bg-accent/92"
                : "bg-muted/80 text-muted-foreground hover:bg-muted",
            )}
          >
            <Rocket className="size-3.5" strokeWidth={2} />
            Publish
          </button>

          <AnimatePresence>
            {isBusy && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="hidden items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 sm:flex"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                <span className="text-[11px] font-medium text-accent">Building</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {dropdownPlatform && createPortal(dropdownPlatform, document.body)}
      {dropdownWs && createPortal(dropdownWs, document.body)}
      {dropdownApp && createPortal(dropdownApp, document.body)}

      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        projectId={project?.id ?? null}
        planId={planId}
        initialDraft={publishDraft}
        onSaved={(d) => setPublishDraft(d)}
        artifactsReady={publishReady}
      />

      <WorkspaceIntegrationsModal
        open={integrationOpen !== null}
        preset={integrationOpen ?? "supabase"}
        projectId={project?.id ?? null}
        onClose={() => setIntegrationOpen(null)}
      />
    </>
  );
}
