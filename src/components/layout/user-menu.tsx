"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  CreditCard,
  HelpCircle,
  LogOut,
  Gift,
  ChevronRight,
  Zap,
  ArrowUpRight,
  CalendarClock,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore, getMonthlyTokenQuotaForPlan } from "@/lib/stores/credits-store";
import { DreamSpaceGlyph, resolveDreamSpaceLabel } from "@/lib/dream-space";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { LogoutConfirmModal } from "@/components/auth/logout-confirm-modal";

// ─── Menu item types ──────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const Icon = item.icon;

  const inner = (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition",
        item.danger
          ? "text-red-500 hover:bg-red-500/8 hover:text-red-500"
          : "text-foreground hover:bg-surface",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.65} />
      <span className="flex-1">{item.label}</span>
      {item.href && (
        <ChevronRight className="size-3.5 text-muted-foreground/50" strokeWidth={1.75} />
      )}
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className="block cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        item.onClick?.();
        onClose();
      }}
      className="w-full cursor-pointer rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UserMenu() {
  const { profile, user } = useAuthStore();
  const { remaining, resetAt } = useCreditsStore();
  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const safeProfile = hydrated ? profile : null;
  const dreamLabel = resolveDreamSpaceLabel(safeProfile, hydrated ? user : null);
  const quota = getMonthlyTokenQuotaForPlan(safeProfile?.plan_id);
  const planLabel = safeProfile
    ? safeProfile.plan_id === "free"
      ? "Free plan"
      : `${safeProfile.plan_id.charAt(0).toUpperCase() + safeProfile.plan_id.slice(1)} plan`
    : "";
  const isFree = !safeProfile || safeProfile.plan_id === "free";
  const resetDate =
    hydrated && resetAt
      ? new Date(resetAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  function handleLogout() {
    setOpen(false);
    setShowLogoutModal(true);
  }

  const menuItems: MenuItem[] = [
    { id: "space", label: "Space settings", icon: Settings, href: "/settings" },
    { id: "billing", label: "Billing", icon: CreditCard, href: "/settings/billing" },
    { id: "referrals", label: "Referrals", icon: Gift, href: "/referrals" },
    { id: "help", label: "Help", icon: HelpCircle, href: "/help" },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hidden cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] sm:flex"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="text-right leading-tight">
          <p className="max-w-[140px] truncate text-[12px] font-medium tracking-[-0.01em] text-foreground">
            {dreamLabel}
          </p>
          {planLabel && <p className="text-[11px] text-muted-foreground">{planLabel}</p>}
        </div>
        <DreamSpaceGlyph
          iconUrl={safeProfile?.workspace_icon_url}
          label={dreamLabel}
          sizeClass="size-8"
          textClassName="text-[12px]"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-[var(--radius-xl)] bg-background shadow-2xl ring-1 ring-border"
          >
            <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-accent/[0.07] via-background to-background px-4 py-3.5">
              <DreamSpaceGlyph
                iconUrl={safeProfile?.workspace_icon_url}
                label={dreamLabel}
                sizeClass="size-11"
                textClassName="text-sm"
                className="rounded-2xl ring-border-strong shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground">{dreamLabel}</p>
                {(safeProfile?.email || (hydrated ? user?.email : null)) && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {safeProfile?.email || user?.email}
                  </p>
                )}
                {planLabel && (
                  <span className="mt-1 inline-flex rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/15">
                    {planLabel}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 border-b border-border px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Zap className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} />
                  Credits remaining
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{remaining.toLocaleString()}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <span className="tabular-nums">{remaining.toLocaleString()}</span>
                <span className="mx-1 text-muted-foreground/60">/</span>
                <span className="tabular-nums">{quota.toLocaleString()}</span>
                <span className="ml-1">this billing period</span>
              </p>
              {resetDate && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarClock className="size-3 shrink-0" strokeWidth={1.75} />
                  Allowance resets {resetDate}
                </div>
              )}
              {isFree && (
                <Link
                  href="/pricing"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent/90"
                >
                  <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
                  Upgrade
                </Link>
              )}
            </div>

            <div className="p-1.5">
              {menuItems.map((item) => (
                <MenuRow key={item.id} item={item} onClose={() => setOpen(false)} />
              ))}

              <div className="my-1 h-px bg-border/60 mx-1" />

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-red-500 transition hover:bg-red-500/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4 shrink-0" strokeWidth={1.65} />
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LogoutConfirmModal open={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
}
