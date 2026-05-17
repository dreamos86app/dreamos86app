/**
 * DreamOS86 — Credits Store
 * Single source of truth for credit balance across the entire app.
 * Topbar, credits page, and AI actions all read from here.
 */
import { create } from "zustand";

interface CreditsState {
  remaining: number;
  resetAt: string | null;
  totalUsedThisPeriod: number;
  loading: boolean;
  lastSyncedAt: number | null;
  /**
   * True once the server has responded at least once.
   * We never block generation on credits until this is true —
   * prevents false positives while the store is still hydrating.
   */
  isConfirmed: boolean;

  setCredits: (remaining: number, resetAt?: string | null) => void;
  setUsed: (used: number) => void;
  deductOptimistic: (amount: number) => void;
  setLoading: (loading: boolean) => void;
  syncFromDB: (userId: string) => Promise<void>;
  reset: () => void;
}

/** Monthly quota for the free plan — used as default before first DB sync. */
export const FREE_MONTHLY_QUOTA = 100;

export const useCreditsStore = create<CreditsState>()((set, get) => ({
  // Default to free plan quota so the UI never shows "0 / 0" before first sync.
  remaining: FREE_MONTHLY_QUOTA,
  resetAt: null,
  totalUsedThisPeriod: 0,
  loading: false,
  lastSyncedAt: null,
  isConfirmed: false,

  setCredits: (remaining, resetAt) =>
    set({ remaining, resetAt: resetAt ?? get().resetAt, lastSyncedAt: Date.now(), isConfirmed: true }),

  setUsed: (totalUsedThisPeriod) => set({ totalUsedThisPeriod }),

  deductOptimistic: (amount) =>
    set((s) => ({
      remaining: Math.max(0, s.remaining - amount),
      totalUsedThisPeriod: s.totalUsedThisPeriod + amount,
    })),

  setLoading: (loading) => set({ loading }),

  syncFromDB: async (_userId: string) => {
    // Avoid hammering the DB — skip if synced within last 30s
    const { lastSyncedAt, loading } = get();
    if (loading || (lastSyncedAt && Date.now() - lastSyncedAt < 30_000)) return;

    set({ loading: true });
    try {
      const res = await fetch("/api/credits");
      if (!res.ok) throw new Error("Failed to fetch credits");
      const data = await res.json();

      // Only treat as 0 if the server explicitly returned a confirmed 0.
      // If data.remaining is undefined/null the wallet may not be initialized yet
      // — fall back to the free plan quota so we don't block generation.
      const serverValue = data.remaining;
      const remaining = typeof serverValue === "number"
        ? Math.max(0, serverValue)
        : FREE_MONTHLY_QUOTA;

      set({
        remaining,
        resetAt: data.reset_at ?? null,
        totalUsedThisPeriod: data.total_used ?? 0,
        loading: false,
        lastSyncedAt: Date.now(),
        // Mark confirmed only if the server returned a definitive value
        isConfirmed: typeof serverValue === "number",
      });
    } catch {
      // On network error, don't mark as confirmed — keep the default quota
      set({ loading: false });
    }
  },

  reset: () =>
    set({
      remaining: FREE_MONTHLY_QUOTA,
      resetAt: null,
      totalUsedThisPeriod: 0,
      loading: false,
      lastSyncedAt: null,
      isConfirmed: false,
    }),
}));
