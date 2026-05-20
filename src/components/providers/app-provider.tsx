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
import { useCreditsStore, FREE_MONTHLY_QUOTA } from "@/lib/stores/credits-store";
import { useNotificationsStore } from "@/lib/stores/notifications-store";
import type { Notification } from "@/lib/supabase/types";
import { ReferralCapture } from "@/components/referrals/referral-capture";
import { CommandCenter } from "@/components/command/command-center";
import { AuthStateDebug } from "@/components/dev/auth-state-debug";
import { hasActiveSession, isStalePersistedProfile } from "@/lib/auth/client-identity";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser, setSession, setProfile, setLoading, reset: resetAuth } =
    useAuthStore();
  const { syncFromDB: syncCredits, reset: resetCredits } = useCreditsStore();
  const { setNotifications, addNotification, reset: resetNotifications } =
    useNotificationsStore();

  // Rehydrate persisted Zustand state AFTER mount. The store is created
  // with `skipHydration: true` so SSR and first client paint match. We
  // trigger rehydration here, then bootstrap the live session below.
  React.useEffect(() => {
    void useAuthStore.persist.rehydrate();
  }, []);

  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  React.useEffect(() => {
    if (loading) return;
    if (!hasActiveSession(session, user)) return;
    if (!profile?.id) return;
    if (!pathname) return;
    if (pathname.startsWith("/auth")) return;
    if (pathname.startsWith("/onboarding")) return;
    if (pathname.startsWith("/api")) return;
    if (pathname === "/" || pathname === "/terms" || pathname === "/privacy" || pathname === "/contact") {
      return;
    }

    if (profile.onboarding_completed !== true) {
      router.replace("/onboarding");
    }
  }, [loading, session, user, profile?.id, profile?.onboarding_completed, pathname, router]);

  React.useEffect(() => {
    const supabase = createClient();

    async function bootstrapUser(userId: string): Promise<() => void> {
      let { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!profile && typeof fetch !== "undefined") {
        try {
          const res = await fetch("/api/profile/ensure", {
            method: "POST",
            credentials: "include",
          });
          if (res.ok) {
            const payload = (await res.json()) as { profile?: typeof profile };
            if (payload.profile) profile = payload.profile;
          }
        } catch {
          /* ignore — user may retry on refresh */
        }
        if (!profile) {
          const retry = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
          profile = retry.data ?? null;
        }
      }

      if (profile) {
        setProfile(profile);
        // Set credits from profile immediately so we never flash 0.
        // `setCredits` marks the store as `isConfirmed = true`, preventing
        // false "out of credits" blocks during initial hydration.
        const creditsValue = typeof profile.credits_remaining === "number"
          ? profile.credits_remaining
          : null;
        if (creditsValue !== null) {
          const planId = profile.plan_id ?? "free";
          const capped =
            planId === "free"
              ? Math.min(creditsValue, FREE_MONTHLY_QUOTA)
              : creditsValue;
          useCreditsStore.getState().setCredits(
            capped,
            profile.credits_reset_at ?? null,
          );
        }
      }

      const { data: notifications } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (notifications) {
        setNotifications(notifications as Notification[]);
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
            const p = payload.new as {
              credits_remaining: number;
              credits_reset_at: string;
            };
            useCreditsStore
              .getState()
              .setCredits(p.credits_remaining, p.credits_reset_at);
            setProfile({
              ...useAuthStore.getState().profile!,
              ...payload.new,
            });
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(notificationsChannel);
        supabase.removeChannel(profileChannel);
      };
    }

    let disposeRealtime: (() => void) | undefined;

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
        // Only push if not already on an auth page — the logout modal does a full
        // window.location.href redirect which is more reliable. This is a fallback
        // for programmatic/server-side sign-outs that don't use the modal.
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
          router.push("/auth/login");
        }
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        syncCredits(session.user.id);
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
      disposeRealtime?.();
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <ReferralCapture />
      <CommandCenter />
      <AuthStateDebug />
      {children}
    </>
  );
}
