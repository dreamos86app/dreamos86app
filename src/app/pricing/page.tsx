import type { Metadata } from "next";
import { PublicMarketingShell } from "@/components/marketing/public-marketing-shell";
import { PricingView } from "@/components/pricing/pricing-view";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "DreamOS86 pricing — Free, Starter, Pro, and Infinity plans with Build Credits and Action Credits.",
};

export default function PublicPricingPage() {
  return (
    <PublicMarketingShell className="bg-atmosphere">
      <div data-testid="public-pricing-page" className="pb-16">
        <PricingView publicMode />
      </div>
    </PublicMarketingShell>
  );
}
