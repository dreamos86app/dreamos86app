"use client";

/**
 * Ends Supabase session everywhere: SSR cookies, browser client (global), persisted auth, then hard-navigate to /auth/login.
 */
import { DREAMOS_REF_COOKIE, DREAMOS_REF_STORAGE_KEY } from "@/lib/auth/ref-cookie";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { useNotificationsStore } from "@/lib/stores/notifications-store";

export async function runFullSignOut(): Promise<void> {
  try {
    await Promise.race([
      fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("signout_fetch_timeout")), 5000),
      ),
    ]);
  } catch {
    /* still clear client + storage */
  }

  try {
    const supabase = createClient();
    await Promise.race([
      supabase.auth.signOut({ scope: "global" }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("client_signout_timeout")), 4000),
      ),
    ]);
  } catch {
    /* ignore */
  }

  try {
    await useAuthStore.persist.clearStorage();
  } catch {
    /* ignore */
  }

  try {
    const keys = Object.keys(localStorage).filter(
      (k) =>
        k.startsWith("sb-") ||
        k === "dreamos-auth" ||
        k === DREAMOS_REF_STORAGE_KEY ||
        k === "supabase.auth.token",
    );
    keys.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {
    /* ignore */
  }

  try {
    document.cookie = `${DREAMOS_REF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }

  useAuthStore.getState().reset();
  useCreditsStore.getState().reset();
  useNotificationsStore.getState().reset();

  window.location.href = "/auth/login";
}
