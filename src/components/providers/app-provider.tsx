"use client";

/**
 * DreamOS86 — App Provider
 * Bootstraps Supabase auth listener, syncs to Zustand stores,
 * and wires up realtime subscriptions.
 *
 * Client-only: Supabase browser client is created inside useEffect so static
 * prerender (no public env vars) does not instantiate @supabase/ssr.
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore, refreshCredits } from "@/lib/stores/credits-store";
import { useCreditsSync } from "@/hooks/use-credits-sync";
import { useNotificationsStore } from "@/lib/stores/notifications-store";
import type { Notification } from "@/lib/supabase/types";
import { ReferralCapture } from "@/components/referrals/referral-capture";
import { ReferralGuard } from "@/components/referrals/referral-guard";
import { ReferralNoticeHandler } from "@/components/referrals/referral-notice-handler";
import { CommandCenter } from "@/components/command/command-center";
import { RecentPagesTracker } from "@/components/navigation/recent-pages-tracker";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { AuthStateDebug } from "@/components/dev/auth-state-debug";
import { hasActiveSession, isStalePersistedProfile } from "@/lib/auth/client-identity";
import { isE2eCreditTestAccount } from "@/lib/credits/e2e-credit-account";
import {
  getCachedBootstrap,
  invalidateBootstrapCache,
  setCachedBootstrap,
} from "@/lib/cache/session-bootstrap-cache";
import { seedCreditsFromProfile } from "@/lib/credits/seed-credits-from-profile";
import {
  loadUserProfileCoreDeduped,
} from "@/lib/supabase/load-user-profile";
import type { Profile } from "@/lib/supabase/types";
import { installChunkLoadRecovery } from "@/lib/navigation/chunk-load-recovery";
import { isOnboardingExemptPath } from "@/lib/onboarding/exempt-paths";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser, setSession, setProfile, setLoading, reset: resetAuth } =
    useAuthStore();
  const { reset: resetCredits } = useCreditsStore();
  const { setNotifications, addNotification, reset: resetNotifications } =
    useNotificationsStore();

  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const creditsSyncEnabled = Boolean(user?.id ?? profile?.id);
  useCreditsSync(creditsSyncEnabled);

  React.useEffect(() => {
    if (!profile?.id) return;
    const { isConfirmed } = useCreditsStore.getState();
    if (!isConfirmed) seedCreditsFromProfile(profile);
  }, [profile?.id, profile?.plan_id, profile]);

  React.useEffect(() => {
    void useAuthStore.persist.rehydrate();
    return installChunkLoadRecovery();
  }, []);

  React.useEffect(() => {
    if (loading) return;
    if (!hasActiveSession(session, user)) return;
    if (!profile?.id) return;
    if (!pathname) return;
    if (pathname.startsWith("/auth")) return;
    if (pathname.startsWith("/api")) return;
    if (pathname === "/" || pathname === "/terms" || pathname === "/privacy" || pathname === "/contact") {
      return;
    }

    if (profile.onboarding_completed !== true) {
      if (isOnboardingExemptPath(pathname)) {
        void (async () => {
          const { data } = await createClient()
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", profile.id)
            .maybeSingle();
          if (data?.onboarding_completed === true) {
            setProfile({ ...profile, onboarding_completed: true });
          }
        })();
        return;
      }
      if (!isE2eCreditTestAccount(profile.email ?? user?.email)) {
        router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
      }
    }
  }, [loading, session, user, profile?.id, profile?.onboarding_completed, pathname, router]);

  React.useEffect(() => {
    const supabase = createClient();

    async function bootstrapUser(userId: string): Promise<() => void> {
      let creditRefreshTimer: ReturnType<typeof setTimeout> | undefined;

      const cached = getCachedBootstrap(userId);
      if (cached?.profile) {
        setProfile(cached.profile);
        seedCreditsFromProfile(cached.profile);
        void useCreditsStore.getState().syncFromDB({ reason: "bootstrap" });
      }
      if (cached?.notifications.length) {
        setNotifications(cached.notifications);
      }

      const profilePromise = loadUserProfileCoreDeduped(supabase, userId);
      const notificationsPromise = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      let { profile: coreProfile } = await profilePromise;

      if (!coreProfile && typeof fetch !== "undefined") {
        try {
          const res = await fetch("/api/profile/ensure", {
            method: "POST",
            credentials: "include",
          });
          if (res.ok) {
            const payload = (await res.json()) as { profile?: Partial<Profile> };
            if (payload.profile) coreProfile = payload.profile;
          }
        } catch {
          /* ignore — user may retry on refresh */
        }
        if (!coreProfile) {
          const retry = await loadUserProfileCoreDeduped(supabase, userId);
          coreProfile = retry.profile;
        }
      }

      if (coreProfile) {
        const profile = coreProfile as Profile;
        setProfile(profile);
        seedCreditsFromProfile(profile);
      }

      let notificationRows = (await notificationsPromise).data ?? [];

      if (coreProfile) {
        try {
          const welcomeRes = await fetch("/api/notifications/welcome", {
            method: "POST",
            credentials: "include",
          });
          if (welcomeRes.ok) {
            const payload = (await welcomeRes.json()) as { created?: boolean };
            if (payload.created) {
              const { data: refreshed } = await supabase
                .from("notifications")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(50);
              if (refreshed) notificationRows = refreshed;
            }
          }
        } catch {
          /* welcome is best-effort */
        }
      }

      if (notificationRows.length >= 0) {
        setNotifications(notificationRows as Notification[]);
      }

      if (coreProfile) {
        setCachedBootstrap(userId, {
          profile: coreProfile as Profile,
          notifications: notificationRows as Notification[],
        });
      }

      const notificationsChannel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            addNotification(payload.new as Notification);
          },
        )
        .subscribe();

      const profileChannel = supabase
        .channel(`profile:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            setProfile({
              ...useAuthStore.getState().profile!,
              ...payload.new,
            });
            if (creditRefreshTimer) clearTimeout(creditRefreshTimer);
            creditRefreshTimer = setTimeout(
              () => void refreshCredits({ reason: "profile-realtime" }),
              1500,
            );
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(notificationsChannel);
        supabase.removeChannel(profileChannel);
      };
    }

    let disposeRealtime: (() => void) | undefined;

    let disposed = false;
    const authTimeout = window.setTimeout(() => {
      if (!disposed) setLoading(false);
    }, 10_000);

    void supabase.auth.getUser().then(async ({ data: { user: liveUser } }) => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(liveUser ?? null);

      const persisted = useAuthStore.getState().profile;
      if (isStalePersistedProfile(session, persisted, liveUser)) {
        setProfile(null);
      }

      if (liveUser) {
        if (persisted && persisted.id !== liveUser.id) {
          setProfile(null);
        }
        const dispose = await bootstrapUser(liveUser.id);
        disposeRealtime = dispose;
      } else {
        setProfile(null);
        try {
          await useAuthStore.persist.clearStorage();
        } catch {
          /* ignore */
        }
      }

      setLoading(false);
      window.clearTimeout(authTimeout);
    }).catch(() => {
      setLoading(false);
      window.clearTimeout(authTimeout);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (event === "SIGNED_IN" && session?.user) {
        disposeRealtime?.();
        disposeRealtime = await bootstrapUser(session.user.id);
        router.refresh();
      }

      if (event === "SIGNED_OUT") {
        invalidateBootstrapCache();
        disposeRealtime?.();
        disposeRealtime = undefined;
        try {
          void useAuthStore.persist.clearStorage();
        } catch { /* ignore */ }
        try {
          const keys = Object.keys(localStorage).filter(
            (k) =>
              k.startsWith("sb-") ||
              k === "dreamos-auth" ||
              k === "supabase.auth.token",
          );
          keys.forEach((k) => localStorage.removeItem(k));
          sessionStorage.clear();
        } catch { /* ignore in SSR */ }
        resetAuth();
        resetCredits();
        resetNotifications();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
          router.push("/auth/login");
        }
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        void refreshCredits({ reason: "bootstrap" });
      }

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        void supabase.auth.getUser().then(({ data: { user: u } }) => {
          if (!u) {
            setProfile(null);
            try {
              void useAuthStore.persist.clearStorage();
            } catch {
              /* ignore */
            }
          }
        });
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(authTimeout);
      disposeRealtime?.();
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <NavigationProgress />
      <RecentPagesTracker />
      <React.Suspense fallback={null}>
        <ReferralGuard />
        <ReferralNoticeHandler />
      </React.Suspense>
      <ReferralCapture />
      <CommandCenter />
      <AuthStateDebug />
      {children}
    </>
  );
}
