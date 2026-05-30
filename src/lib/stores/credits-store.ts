import { create } from "zustand";
import { monthlyTokensForPlan, normalizePlanId } from "@/lib/billing/plans";
import type { CanonicalCreditBucket, CanonicalCreditsPayload } from "@/lib/credits/canonical-credits";
import { dispatchCreditUpdated } from "@/lib/credits/credit-events-client";

export type { CanonicalCreditBucket, CanonicalCreditsPayload };

/** Data older than this is refreshed on explicit triggers (popover open, etc.). */
export const CREDITS_STALE_MS = 90_000;

/** Minimum time to show loading state so balances do not flash stale numbers. */
export const CREDITS_MIN_LOADING_MS = 450;

/** Optional background refresh — only when tab is visible and data is very stale. */
export const CREDITS_BACKGROUND_STALE_MS = 120_000;

export type CreditSyncReason =
  | "bootstrap"
  | "popover-open"
  | "charge"
  | "admin-action"
  | "plan-change"
  | "profile-realtime"
  | "manual"
  | "invalidated";

export type CreditSyncOptions = {
  force?: boolean;
  reason?: CreditSyncReason;
};

const EMPTY_BUCKET: CanonicalCreditBucket = {
  available: 0,
  planAllowance: 0,
  usedThisPeriod: 0,
  bonusActive: 0,
  bonusLabel: null,
  bonusExpiresAt: null,
  resetDate: null,
  reserved: 0,
  source: "canonical_balance",
};

interface CreditsState {
  build: CanonicalCreditBucket;
  action: CanonicalCreditBucket;
  planId: string;
  loading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  isConfirmed: boolean;

  applyCanonical: (payload: CanonicalCreditsPayload) => void;
  /** Profile/bootstrap hint — not confirmed until /api/credits succeeds. */
  applyProfileHint: (payload: CanonicalCreditsPayload) => void;
  syncFromDB: (options?: CreditSyncOptions) => Promise<CanonicalCreditsPayload | null>;
  deductOptimistic: (amount: number) => void;
  reset: () => void;

  /** @deprecated use build.available */
  remaining: number;
  /** @deprecated use build.planAllowance */
  planAllowance: number;
  /** @deprecated use build.bonusActive */
  bonusCredits: number;
  /** @deprecated use action.available */
  actionCreditsRemaining: number;
  /** @deprecated use action.planAllowance */
  actionCreditsPlanAllowance: number;
  /** @deprecated use action.bonusActive */
  actionCreditsBonus: number;
  /** @deprecated use build.resetDate */
  resetAt: string | null;
  /** @deprecated use build.usedThisPeriod */
  totalUsedThisPeriod: number;
}

let inFlightRequest: Promise<CanonicalCreditsPayload | null> | null = null;

function roundCredit(value: number): number {
  return Math.round(value * 10) / 10;
}

function withLegacyFields(state: {
  build: CanonicalCreditBucket;
  action: CanonicalCreditBucket;
  planId: string;
  loading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  isConfirmed: boolean;
}) {
  return {
    ...state,
    remaining: state.build.available,
    planAllowance: state.build.planAllowance,
    bonusCredits: state.build.bonusActive,
    actionCreditsRemaining: state.action.available,
    actionCreditsPlanAllowance: state.action.planAllowance,
    actionCreditsBonus: state.action.bonusActive,
    resetAt: state.build.resetDate,
    totalUsedThisPeriod: state.build.usedThisPeriod,
  };
}

function logCreditSync(reason: CreditSyncReason | undefined, detail: string) {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_PUBLIC_CREDITS_DEBUG !== "1") return;
  console.debug(`[credits] ${reason ?? "sync"}: ${detail}`);
}

export const useCreditsStore = create<CreditsState>()((set, get) => ({
  ...withLegacyFields({
    build: { ...EMPTY_BUCKET, planAllowance: 30 },
    action: { ...EMPTY_BUCKET, planAllowance: 25 },
    planId: "free",
    loading: false,
    error: null,
    lastSyncedAt: null,
    isConfirmed: false,
  }),

  applyCanonical: (payload) => {
    set(
      withLegacyFields({
        build: payload.build,
        action: payload.action,
        planId: payload.planId,
        loading: false,
        error: null,
        lastSyncedAt: Date.now(),
        isConfirmed: true,
      }),
    );
  },

  /** Plan-only hint from profile — never overwrites confirmed credit balances. */
  applyProfileHint: (payload) => {
    set((s) => {
      if (s.isConfirmed) {
        return withLegacyFields({ ...s, planId: payload.planId });
      }
      return withLegacyFields({
        ...s,
        planId: payload.planId,
        loading: true,
        error: null,
        lastSyncedAt: null,
        isConfirmed: false,
      });
    });
  },

  deductOptimistic: (amount) =>
    set((s) =>
      withLegacyFields({
        build: {
          ...s.build,
          available: Math.max(0, roundCredit(s.build.available - amount)),
          usedThisPeriod: roundCredit(s.build.usedThisPeriod + amount),
        },
        action: s.action,
        planId: s.planId,
        loading: s.loading,
        error: s.error,
        lastSyncedAt: s.lastSyncedAt,
        isConfirmed: s.isConfirmed,
      }),
    ),

  syncFromDB: async (options) => {
    const force = options?.force ?? false;
    const reason = options?.reason;
    const { lastSyncedAt, loading, isConfirmed } = get();

    if (!force && isConfirmed && lastSyncedAt && Date.now() - lastSyncedAt < CREDITS_STALE_MS) {
      logCreditSync(reason, "skipped — fresh cache");
      return {
        build: get().build,
        action: get().action,
        planId: normalizePlanId(get().planId) as CanonicalCreditsPayload["planId"],
      };
    }

    if (inFlightRequest) {
      logCreditSync(reason, "deduped — joined in-flight request");
      return inFlightRequest;
    }

    const loadStartedAt = Date.now();
    set({ loading: true, error: null });

    inFlightRequest = (async () => {
      try {
        const res = await fetch("/api/credits", {
          credentials: "include",
          cache: "no-store",
          headers: { "X-Credit-Sync-Reason": reason ?? "sync" },
        });
        if (!res.ok) throw new Error(`Failed to fetch credits (${res.status})`);

        const data = (await res.json()) as CanonicalCreditsPayload & {
          build?: CanonicalCreditBucket;
          action?: CanonicalCreditBucket;
          plan_id?: string;
        };

        if (!data.build || !data.action) {
          throw new Error("Invalid canonical credits response");
        }

        const payload: CanonicalCreditsPayload = {
          build: data.build,
          action: data.action,
          planId: normalizePlanId(data.plan_id ?? "free") as CanonicalCreditsPayload["planId"],
        };

        const elapsed = Date.now() - loadStartedAt;
        const waitMs = Math.max(0, CREDITS_MIN_LOADING_MS - elapsed);
        if (waitMs > 0) {
          await new Promise((r) => setTimeout(r, waitMs));
        }
        get().applyCanonical(payload);
        dispatchCreditUpdated(payload);
        logCreditSync(reason, "fetched ok");
        return payload;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Credit sync failed";
        const elapsed = Date.now() - loadStartedAt;
        const waitMs = Math.max(0, CREDITS_MIN_LOADING_MS - elapsed);
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        set({ loading: false, error: msg });
        logCreditSync(reason, `error — ${msg}`);
        return null;
      } finally {
        inFlightRequest = null;
      }
    })();

    return inFlightRequest;
  },

  reset: () =>
    set(
      withLegacyFields({
        build: { ...EMPTY_BUCKET, planAllowance: 30 },
        action: { ...EMPTY_BUCKET, planAllowance: 25 },
        planId: "free",
        loading: false,
        error: null,
        lastSyncedAt: null,
        isConfirmed: false,
      }),
    ),
}));

/** Refresh credits after charge/admin/plan change — single forced fetch. */
export function refreshCredits(options?: CreditSyncOptions) {
  return useCreditsStore.getState().syncFromDB({
    force: true,
    reason: options?.reason ?? "manual",
    ...options,
  });
}

/** Resolve monthly build cap for display before canonical sync confirms. */
export function resolveBuildCreditCap(
  bucket: CanonicalCreditBucket | undefined,
  planId: string | undefined,
  isConfirmed: boolean,
): number {
  const planCap = monthlyTokensForPlan(normalizePlanId(planId ?? "free"));
  if (!isConfirmed || !bucket?.planAllowance) return planCap;
  return Math.max(bucket.planAllowance, planCap);
}

export const FREE_MONTHLY_QUOTA = 30;

/** @deprecated Prefer canonical plan allowance from store */
export function getMonthlyTokenQuotaForPlan(planId: string | undefined): number {
  return monthlyTokensForPlan(normalizePlanId(planId ?? "free"));
}
