"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Zap,
  CreditCard,
  Settings,
  BookOpen,
  HelpCircle,
  KeyRound,
  Globe,
  Shield,
  Users,
  LogOut,
  ExternalLink,
  LayoutGrid,
  ArrowLeft,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/ui/logo-icon";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { resolveDisplayName } from "@/lib/profile-display";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { LogoutConfirmModal } from "@/components/auth/logout-confirm-modal";
import { FREE_MONTHLY_QUOTA } from "@/lib/stores/credits-store";

// ─── Credit ring progress ─────────────────────────────────────────────────────

function CreditRing({
  used,
  limit,
  size = 36,
}: {
  used: number;
  limit: number;
  size?: number;
}) {
  const pct = Math.min(1, limit > 0 ? used / limit : 0);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3}
        className="text-muted/40" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} className="text-accent transition-all duration-500" />
    </svg>
  );
}

// ─── Workspace dropdown panel ─────────────────────────────────────────────────

interface WorkspaceDropdownProps {
  onClose: () => void;
  anchorRect: DOMRect | null;
  onLogout: () => void;  // hoisted to parent so modal survives dropdown unmount
}

function WorkspaceDropdown({ onClose, anchorRect, onLogout }: WorkspaceDropdownProps) {
  const { profile, user } = useAuthStore();
  const remaining = useCreditsStore((s) => s.remaining);
  const hydrated = useHydrated();
  const launcherName = resolveDisplayName(profile, user);

  const plan = profile?.plan_id ?? "free";
  const planLabel = plan === "free" ? "Free" : plan.charAt(0).toUpperCase() + plan.slice(1);
  const planQuota = plan === "free" ? FREE_MONTHLY_QUOTA : plan === "pro" ? 25000 : plan === "business" ? 100000 : 10000;
  const FREE_QUOTA = planQuota;
  const used = Math.max(0, FREE_QUOTA - remaining);

  function handleLogout() {
    onClose();      // close the dropdown first
    onLogout();     // open modal in parent — survives dropdown unmount
  }

  const navLinks: Array<{ href: string; icon: React.ElementType; label: string }> = [
    { href: "/settings", icon: Settings, label: "Workspace settings" },
    { href: "/settings/billing", icon: CreditCard, label: "Billing" },
    { href: "/pricing", icon: Zap, label: "Pricing plans" },
    { href: "/help", icon: BookOpen, label: "Documentation" },
    { href: "/help", icon: HelpCircle, label: "Help center" },
    { href: "/settings/api-keys", icon: KeyRound, label: "API keys" },
    { href: "/settings/integrations", icon: Globe, label: "Domains & deploy" },
    { href: "/settings/team", icon: Shield, label: "Security" },
    { href: "/settings/team", icon: Users, label: "Team" },
  ];

  if (!anchorRect) return null;

  const top = anchorRect.bottom + 6;
  const left = anchorRect.left;

  const panel = (
    <motion.div
      data-ws-dropdown="true"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "fixed", top, left, zIndex: 10000, width: 300 }}
      className="overflow-hidden rounded-2xl bg-background shadow-[0_20px_60px_-12px_rgba(0,0,0,0.35)] ring-1 ring-border"
      onClick={(e) => e.stopPropagation()}
    >
      {/* User identity header */}
      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-3">
          {/* User avatar */}
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={launcherName}
              className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/50 to-violet-500/50 text-[13px] font-bold text-white"
            >
              {launcherName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {launcherName}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                {planLabel}
              </span>
              <span className="text-[10.5px] text-muted-foreground/60">
                {profile?.email ?? ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Credit usage card */}
      {hydrated && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tokens
            </p>
            <Link
              href="/credits"
              onClick={onClose}
              className="flex items-center gap-1 text-[10.5px] text-accent hover:underline underline-offset-2"
            >
              <TrendingUp className="size-3" strokeWidth={1.75} />
              Details
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <CreditRing used={used} limit={FREE_QUOTA} size={42} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground tabular-nums">
                {remaining.toLocaleString()}
                <span className="ml-0.5 text-[11px] font-normal text-muted-foreground/60">
                  {" "}/ {FREE_QUOTA.toLocaleString()}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {plan === "free" ? "Free · 100 tokens / month" : `${planLabel} plan`}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                remaining / FREE_QUOTA < 0.2 ? "bg-destructive/70" : "bg-accent",
              )}
              style={{ width: `${Math.min(100, (remaining / FREE_QUOTA) * 100)}%` }}
            />
          </div>
          {plan === "free" && remaining < 25 && (
            <Link
              href="/pricing"
              onClick={onClose}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-violet-500 px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90"
            >
              <Zap className="size-3.5" strokeWidth={2} />
              Upgrade for more tokens
            </Link>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="p-1.5">
        {navLinks.map(({ href, icon: Icon, label }) => (
          <Link
            key={`${href}-${label}`}
            href={href}
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            <Icon className="size-3.5 shrink-0" strokeWidth={1.65} />
            {label}
          </Link>
        ))}
      </div>

      {/* Divider + Logout */}
      <div className="border-t border-border p-1.5">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] text-destructive/80 transition hover:bg-destructive/8 hover:text-destructive"
        >
          <LogOut className="size-3.5" strokeWidth={1.65} />
          Log out
        </button>
      </div>
    </motion.div>
  );

  return panel;
}

// ─── Public WorkspaceLauncher ─────────────────────────────────────────────────

export function WorkspaceLauncher({
  projectName,
  isBusy,
}: {
  projectName?: string | null;
  isBusy?: boolean;
}) {
  const { profile, user } = useAuthStore();
  const [open, setOpen] = React.useState(false);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const workspaceName = (() => {
    const dn = resolveDisplayName(profile, user);
    if (dn && dn !== "User") return `${dn.split(/\s+/)[0]}'s Workspace`;
    return profile?.email?.split("@")[0] ?? "Workspace";
  })();

  React.useEffect(() => { setMounted(true); }, []);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Element;
      // Close only if click is outside the trigger AND outside the portal dropdown
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = !!target.closest("[data-ws-dropdown]");
      if (!insideTrigger && !insidePanel) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleClick() {
    if (!open && triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  const dropdown = mounted
    ? createPortal(
        <AnimatePresence>
          {open && (
            <WorkspaceDropdown
              onClose={() => setOpen(false)}
              anchorRect={anchorRect}
              onLogout={() => setShowLogoutModal(true)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-0 border-b border-border/50 bg-background/80 px-3 backdrop-blur-xl">
        {/* Back to home */}
        <Link
          href="/"
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-surface hover:text-foreground"
          aria-label="Back to home"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
        </Link>

        {/* Workspace launcher trigger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={handleClick}
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium transition",
            open
              ? "bg-surface text-foreground ring-1 ring-border"
              : "text-muted-foreground hover:bg-surface/60 hover:text-foreground",
          )}
        >
          <LogoIcon size={16} className="shrink-0" />
          <span className="max-w-[120px] truncate">{workspaceName}</span>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="size-3 text-muted-foreground/60" strokeWidth={1.75} />
          </motion.span>
        </button>

        {/* App breadcrumb */}
        {projectName && (
          <>
            <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/30" strokeWidth={1.75} />
            <span className="max-w-[160px] truncate text-[12.5px] font-semibold text-foreground">
              {projectName}
            </span>
          </>
        )}

        {/* Right side: live orchestration indicator */}
        <div className="ml-auto flex items-center gap-2">
          <AnimatePresence>
            {isBusy && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                <span className="text-[11px] font-medium text-accent">Building…</span>
              </motion.div>
            )}
          </AnimatePresence>
          <Link
            href="/projects"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-surface hover:text-foreground"
            aria-label="All apps"
          >
            <LayoutGrid className="size-3.5" strokeWidth={1.65} />
          </Link>
        </div>
      </div>

      {dropdown}

      {/* Logout modal — lives here (not in dropdown) so it persists after dropdown unmounts */}
      <LogoutConfirmModal
        open={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
      />
    </>
  );
}
