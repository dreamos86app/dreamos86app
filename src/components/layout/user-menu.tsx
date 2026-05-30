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
  ArrowUpRight,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { CreditsTracker } from "@/components/credits/credits-tracker";
import { PlanBadge } from "@/components/billing/plan-badge";
import { normalizePlanId } from "@/lib/billing/plans";
import { isHighestPaidPlan, nextUpgradePlanId } from "@/lib/billing/upgrade-policy";
import { resolveEffectivePlanId } from "@/lib/billing/resolve-effective-plan-id";
import { resolveDreamSpaceLabel } from "@/lib/dream-space";
import { resolveDisplayName } from "@/lib/profile-display";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { LogoutConfirmModal } from "@/components/auth/logout-confirm-modal";
import { Avatar } from "@/components/ui/avatar";

type MenuItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
};

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const Icon = item.icon;
  const inner = (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition",
        item.danger
          ? "text-red-500 hover:bg-red-500/8"
          : "text-foreground hover:bg-muted/50",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.65} />
      <span className="flex-1">{item.label}</span>
      {item.href && <ChevronRight className="size-3.5 text-muted-foreground/40" strokeWidth={1.75} />}
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} onClick={onClose} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => { item.onClick?.(); onClose(); }} className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {inner}
    </button>
  );
}

export function UserMenu() {
  const { profile, user } = useAuthStore();
  const build = useCreditsStore((s) => s.build);
  const action = useCreditsStore((s) => s.action);
  const planId = useCreditsStore((s) => s.planId);
  const loading = useCreditsStore((s) => s.loading);
  const error = useCreditsStore((s) => s.error);
  const isConfirmed = useCreditsStore((s) => s.isConfirmed);
  const syncFromDB = useCreditsStore((s) => s.syncFromDB);
  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const safeProfile = hydrated ? profile : null;
  const effectivePlanId = resolveEffectivePlanId({
    profilePlanId: safeProfile?.plan_id,
    storePlanId: planId,
    isCreditsConfirmed: isConfirmed,
  });
  const dreamLabel = resolveDreamSpaceLabel(safeProfile, hydrated ? user : null);
  const displayName = resolveDisplayName(safeProfile, hydrated ? user : null);
  const atHighestPlan = isHighestPaidPlan(effectivePlanId);
  const nextPlan = nextUpgradePlanId(effectivePlanId);
  const upgradeHref = nextPlan ? `/settings/billing?upgrade=${nextPlan}` : "/settings/billing";

  React.useEffect(() => {
    if (!open) return;
    void syncFromDB({ reason: "popover-open" });
  }, [open, syncFromDB]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

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
        className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-1.5 py-1 transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
        aria-label="Account menu"
        aria-expanded={open}
        data-testid="mobile-profile-menu-trigger"
      >
        <div className="hidden max-w-[200px] min-w-0 items-center gap-2 text-right leading-tight sm:flex">
          <p className="truncate text-[12px] font-medium tracking-[-0.01em]">{dreamLabel}</p>
          {hydrated ? <PlanBadge planId={effectivePlanId} size="xs" className="shrink-0" /> : null}
        </div>
        <Avatar
          name={displayName || dreamLabel}
          src={safeProfile?.avatar_url}
          size="md"
          className="ring-2 ring-accent/20"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-3.5rem))] w-[min(320px,calc(100vw-1.5rem))] flex-col overflow-hidden overflow-y-auto rounded-[var(--radius-xl)] bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-border/80"
            data-testid="account-menu-dropdown"
          >
            <div className="shrink-0 border-b border-border/60 bg-gradient-to-br from-accent/[0.06] via-background to-background px-4 py-3">
              <div className="flex items-start gap-3">
                <Avatar
                  name={displayName || dreamLabel}
                  src={safeProfile?.avatar_url}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-[13.5px] font-semibold tracking-[-0.02em]">{dreamLabel}</p>
                    {hydrated ? <PlanBadge planId={effectivePlanId} size="xs" className="shrink-0" /> : null}
                  </div>
                  {(safeProfile?.email || user?.email) && (
                    <p className="truncate text-[11px] text-muted-foreground">{safeProfile?.email || user?.email}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-b border-border/60 px-3 py-2">
              <CreditsTracker
                build={build}
                action={action}
                planId={effectivePlanId}
                isConfirmed={isConfirmed}
                loading={loading || !isConfirmed}
                error={error}
                variant="popover"
                onRetry={() => void syncFromDB({ force: true, reason: "manual" })}
              />
            </div>

            <div className="p-2">
              {!atHighestPlan && nextPlan ? (
                <Link
                  href={upgradeHref}
                  onClick={() => setOpen(false)}
                  className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-accent/90"
                >
                  <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
                  Upgrade
                </Link>
              ) : atHighestPlan ? (
                <Link
                  href="/settings/billing"
                  onClick={() => setOpen(false)}
                  className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-muted/60 px-3 py-2 text-[12px] font-medium text-foreground ring-1 ring-border transition hover:bg-muted"
                >
                  Highest plan · Manage billing
                </Link>
              ) : null}
              {menuItems.map((item) => (
                <MenuRow key={item.id} item={item} onClose={() => setOpen(false)} />
              ))}
              <div className="my-1.5 mx-1 h-px bg-border/50" />
              <button
                type="button"
                onClick={() => { setOpen(false); setShowLogoutModal(true); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-red-500 transition hover:bg-red-500/8"
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
