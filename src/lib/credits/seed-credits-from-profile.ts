import { normalizePlanId } from "@/lib/billing/plans";
import type { CanonicalCreditsPayload } from "@/lib/credits/canonical-credits";
import { useCreditsStore } from "@/lib/stores/credits-store";
import type { Profile } from "@/lib/supabase/types";

/** Plan hint from profile only — balances load from /api/credits when confirmed. */
export function seedCreditsFromProfile(profile: Partial<Profile>): void {
  const planId = normalizePlanId(profile.plan_id ?? "free") as CanonicalCreditsPayload["planId"];
  useCreditsStore.getState().applyProfileHint({
    planId,
    build: useCreditsStore.getState().build,
    action: useCreditsStore.getState().action,
  });
}
