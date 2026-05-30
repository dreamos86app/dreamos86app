"use client";

import * as React from "react";
import Link from "next/link";
import { DreamOS86BrandLockup } from "@/components/brand/dreamos86-brand-lockup";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import { navSections } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { isDreamosOwnerEmail } from "@/lib/admin-owner";
import { formatCreditAmount } from "@/lib/credits/credit-summary";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { CreditsTracker } from "@/components/credits/credits-tracker";
import { PlanBadge } from "@/components/billing/plan-badge";
import { resolveEffectivePlanId } from "@/lib/billing/resolve-effective-plan-id";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import { Zap } from "lucide-react";

type SidebarProps = {
  mobileOpen: boolean;
  onMobileClose: () => void;
};

function NavSection({
  label,
  items,
  pathname,
  onMobileClose,
  collapsed,
  showLabels,
}: {
  label?: string;
  items: typeof navSections[0]["items"];
  pathname: string;
  onMobileClose: () => void;
  collapsed: boolean;
  showLabels: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && showLabels && (
        <p className="mb-1 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/60 uppercase">
          {label}
        </p>
      )}
      {label && !showLabels && (
        <div className="mx-auto my-1.5 h-px w-6 bg-border/60" />
      )}
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href ||
              pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.title}
            aria-current={active ? "page" : undefined}
            onClick={onMobileClose}
            className={cn(
              "group relative flex items-center gap-3 rounded-[var(--radius-md)] text-[13px] font-medium tracking-[-0.01em] transition duration-150 ease-out",
              !showLabels
                ? "mx-auto w-10 justify-center px-0 py-2.5"
                : "px-3 py-2",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)] ring-1 ring-border"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
            <Icon
              className="relative z-10 size-[17px] shrink-0"
              strokeWidth={active ? 1.75 : 1.5}
            />
            {showLabels && (
              <span className="relative z-10 truncate">{item.title}</span>
            )}
            {showLabels && item.badge && (
              <span className="relative z-10 ml-auto rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useAppearanceStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppearanceStore((s) => s.setSidebarCollapsed);
  const { profile, user, session } = useAuthStore();
  const build = useCreditsStore((s) => s.build);
  const action = useCreditsStore((s) => s.action);
  const planId = useCreditsStore((s) => s.planId);
  const isConfirmed = useCreditsStore((s) => s.isConfirmed);
  const loading = useCreditsStore((s) => s.loading);
  const hydrated = useHydrated();

  const ownerEmail = user?.email ?? profile?.email;
  const isOwner = Boolean(ownerEmail && isDreamosOwnerEmail(ownerEmail));
  const effectivePlanId = resolveEffectivePlanId({
    profilePlanId: profile?.plan_id,
    storePlanId: planId,
    isCreditsConfirmed: isConfirmed,
  });
  const visibleSections = navSections.filter(
    (s) => s.label !== "Admin" || isOwner,
  );

  React.useEffect(() => {
    for (const section of visibleSections) {
      for (const item of section.items) {
        router.prefetch(item.href);
      }
    }
  }, [router, visibleSections]);

  const showBrandWordmark = !collapsed || mobileOpen;

  const nav = (
    <nav
      className={cn(
        "flex flex-1 flex-col gap-3 overflow-y-auto pb-4 pt-3 scrollbar-none",
        collapsed ? "px-2" : "px-3",
      )}
    >
      {visibleSections.map((section, i) => (
        <NavSection
          key={i}
          label={section.label}
          items={section.items}
          pathname={pathname}
          onMobileClose={onMobileClose}
          collapsed={collapsed}
          showLabels={!collapsed || mobileOpen}
        />
      ))}
    </nav>
  );

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px] lg:hidden"
            aria-label="Close menu"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          // Mobile: fixed off-screen slide-in overlay
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar/90",
          "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "supports-[backdrop-filter]:bg-sidebar/75 supports-[backdrop-filter]:backdrop-blur-xl",
          // Desktop: static in flex row, fills full viewport height
          "lg:static lg:h-full lg:shrink-0",
          mobileOpen
            ? "translate-x-0 w-[min(82vw,20rem)]"
            : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-[60px]" : "lg:w-[200px]",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border",
            showBrandWordmark ? "justify-between gap-2 px-3" : "justify-center px-2 py-2",
          )}
        >
          <DreamOS86BrandLockup
            variant={
              !showBrandWordmark && !mobileOpen
                ? "sidebarCollapsed"
                : mobileOpen
                  ? "drawer"
                  : "sidebar"
            }
            showText={showBrandWordmark}
            href="/"
            onClick={onMobileClose}
            className={cn(showBrandWordmark ? "min-w-0 flex-1" : "mx-auto")}
            priority
          />
          <button
            type="button"
            className="lg:hidden inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
            onClick={onMobileClose}
            aria-label="Close navigation"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
          {showBrandWordmark && !mobileOpen && (
            <button
              type="button"
              className="hidden lg:flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-foreground"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
            >
              <ChevronRight className="size-3.5 rotate-180" strokeWidth={2} />
            </button>
          )}
        </div>

        {nav}

        {/* Credits indicator + expand control */}
        <div
          className={cn(
            "hidden lg:block shrink-0 border-t border-border",
            collapsed ? "px-2 py-2" : "px-3 py-3",
          )}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              {/* Credits orb in collapsed state */}
              {hydrated && (
                <Link
                  href="/credits"
                  title={`${formatCreditAmount(build.available)} Build Credits`}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-surface hover:text-accent"
                >
                  <Zap className="size-4" strokeWidth={1.65} />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-surface hover:text-foreground"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="size-3.5" strokeWidth={2} />
              </button>
            </div>
          ) : (
            hydrated && (
              <Link href="/credits" className="group block rounded-xl bg-muted/30 px-3 py-3 ring-1 ring-border/60 transition hover:ring-accent/25">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Plan</span>
                  <PlanBadge planId={effectivePlanId} size="xs" />
                </div>
                <CreditsTracker
                  build={build}
                  action={action}
                  planId={effectivePlanId}
                  isConfirmed={isConfirmed}
                  loading={loading || !isConfirmed}
                  variant="mini"
                />
              </Link>
            )
          )}
        </div>
      </aside>
    </>
  );
}
