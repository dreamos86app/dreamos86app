"use client";

import * as React from "react";
import { toast } from "@/lib/toast";
import type { BillablePlanId } from "@/lib/billing/billable-plans";

export type PaddleCheckoutPlan = BillablePlanId;

type PaddleStatusResponse = {
  configured?: boolean;
  publicCheckoutEnabled?: boolean;
  envConsistencyOk?: boolean;
  envErrors?: string[];
};

export function usePaddleBillingReady() {
  const [configured, setConfigured] = React.useState(false);
  const [publicCheckoutEnabled, setPublicCheckoutEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void fetch("/api/billing/paddle/status", { credentials: "include" })
      .then(async (res) => {
        const json = (await res.json()) as PaddleStatusResponse;
        setConfigured(Boolean(json.configured && json.envConsistencyOk !== false));
        setPublicCheckoutEnabled(Boolean(json.publicCheckoutEnabled));
      })
      .catch(() => {
        setConfigured(false);
        setPublicCheckoutEnabled(false);
      })
      .finally(() => setLoading(false));
  }, []);

  return { configured, publicCheckoutEnabled, loading };
}

export function usePaddleCheckout() {
  const [busy, setBusy] = React.useState(false);

  async function startCheckout(
    plan: PaddleCheckoutPlan,
    annual: boolean,
    options?: { source?: "pricing" | "settings" },
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan,
          interval: annual ? "annual" : "monthly",
          confirmed: true,
          source: options?.source ?? "pricing",
        }),
      });
      const json = (await res.json()) as { url?: string; error?: string; code?: string };
      if (!res.ok) {
        if (json.code === "public_checkout_disabled") {
          toast.error(
            json.error ?? "Billing is being activated. Owner test checkout is available for admins.",
          );
        } else {
          throw new Error(json.error ?? "Checkout could not start");
        }
        return;
      }
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return { startCheckout, busy };
}
