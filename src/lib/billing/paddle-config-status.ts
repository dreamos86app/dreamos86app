import {
  BILLABLE_PLAN_DEFINITIONS,
  billablePlanDefinition,
} from "@/lib/billing/billable-plans";
import {
  getPlanBillingCatalog,
  maskId,
  PADDLE_CATALOG_ENV_KEYS,
  resolveCatalogTier,
  type BillablePlanId,
  type CatalogBillingInterval,
} from "@/lib/billing/plan-billing-catalog";
import { validatePaddleEnvironmentConsistency } from "@/lib/billing/paddle-env-consistency";
import {
  paddleOwnerTestCheckoutEnabled,
  paddlePublicCheckoutEnabled,
} from "@/lib/billing/paddle-public-checkout";
import {
  getPaddleBillingStatus,
  missingPaidPlanPriceIds,
  missingPaddleEnvVars,
  paddleEnvironment,
} from "@/lib/billing/paddle-billing";
import {
  localDevProductionPaddleWarning,
  resolvePaddleTransactionCheckoutUrl,
} from "@/lib/billing/paddle-checkout-url";

export type PaddlePriceRowStatus = {
  plan: BillablePlanId;
  planSlug: BillablePlanId;
  interval: CatalogBillingInterval;
  planLabel: string;
  priceId: string | null;
  priceIdMasked: string;
  productId: string | null;
  productIdMasked: string;
  configured: boolean;
  checkoutReady: boolean;
  amountUsd: number;
  currency: string;
  buildCredits: number;
  actionCredits: number;
};

export type PaddleBillingEventRow = {
  id: string;
  createdAt: string;
  eventType: string;
  userId: string | null;
  processingStatus: string | null;
  isSimulation: boolean;
  plan: string | null;
  paddlePriceId: string | null;
};

export type PaddleAdminConfigStatus = {
  environment: "sandbox" | "production";
  credentials: {
    apiKeyConfigured: boolean;
    apiKeyMatchesEnvironment: boolean;
    clientTokenConfigured: boolean;
    clientTokenMatchesEnvironment: boolean;
    webhookSecretConfigured: boolean;
  };
  envConsistencyOk: boolean;
  envErrors: string[];
  envWarnings: string[];
  checkoutReady: boolean;
  allPriceIdsConfigured: boolean;
  missingEnv: string[];
  missingPriceIds: Array<{ plan: string; interval: string }>;
  webhookUrl: string;
  publicCheckoutEnabled: boolean;
  ownerTestCheckoutEnabled: boolean;
  liveModeWarning: string | null;
  checkoutUrl: {
    mode: "explicit" | "default";
    url: string | null;
    displayLabel: string;
    envConfigured: boolean;
    setupError: string | null;
    localDevLiveWarning: string | null;
  };
  priceRows: PaddlePriceRowStatus[];
  vercelEnvChecklist: string[];
  paddleCheckoutRecommendations: string[];
  warnings: string[];
  recentEvents: PaddleBillingEventRow[];
  recentCheckoutAttempts: PaddleBillingEventRow[];
  apiVerify: {
    ok: boolean;
    connectionOk: boolean;
    errors: string[];
    warnings: string[];
  } | null;
};

export function buildPaddleAdminConfigStatus(
  appUrl: string,
  extras?: {
    recentEvents?: PaddleBillingEventRow[];
    recentCheckoutAttempts?: PaddleBillingEventRow[];
    apiVerify?: PaddleAdminConfigStatus["apiVerify"];
  },
): PaddleAdminConfigStatus {
  const status = getPaddleBillingStatus();
  const env = validatePaddleEnvironmentConsistency();
  const missingPrices = missingPaidPlanPriceIds();
  const priceRows: PaddlePriceRowStatus[] = [];

  for (const def of BILLABLE_PLAN_DEFINITIONS) {
    for (const interval of ["monthly", "annual"] as const) {
      const tier = resolveCatalogTier(def.id, interval);
      const configured = Boolean(tier.priceId?.startsWith("pri_"));
      priceRows.push({
        plan: def.id,
        planSlug: def.id,
        interval,
        planLabel: def.label,
        priceId: tier.priceId,
        priceIdMasked: maskId(tier.priceId),
        productId: tier.productId,
        productIdMasked: maskId(tier.productId),
        configured,
        checkoutReady: configured,
        amountUsd: tier.amountUsd,
        currency: "USD",
        buildCredits: tier.buildCredits,
        actionCredits: tier.actionCredits,
      });
    }
  }

  const checkoutUrlResolved = resolvePaddleTransactionCheckoutUrl();

  const vercelEnvChecklist = [
    "PADDLE_ENVIRONMENT=production",
    "PADDLE_API_KEY=",
    "PADDLE_WEBHOOK_SECRET=",
    "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=",
    "PADDLE_CHECKOUT_URL=https://dreamos86.com",
    "PADDLE_PUBLIC_CHECKOUT_ENABLED=false",
    ...PADDLE_CATALOG_ENV_KEYS.filter(
      (k) =>
        k !== "PADDLE_ENVIRONMENT" &&
        k !== "PADDLE_API_KEY" &&
        k !== "PADDLE_WEBHOOK_SECRET" &&
        k !== "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    ).map((key) => `${key}=`),
  ];

  const warnings = [
    "Product IDs (pro_*) alone are not enough. Checkout requires pri_* Price IDs.",
    "Do not use Paddle's manual Create subscription screen for normal users.",
  ];
  if (paddleEnvironment() === "production") {
    warnings.push("Live mode charges real money. Use owner-only test checkout first.");
  }

  return {
    environment: paddleEnvironment(),
    credentials: {
      apiKeyConfigured: env.apiKeyConfigured,
      apiKeyMatchesEnvironment: env.apiKeyMatchesEnvironment,
      clientTokenConfigured: env.clientTokenConfigured,
      clientTokenMatchesEnvironment: env.clientTokenMatchesEnvironment,
      webhookSecretConfigured: env.webhookSecretConfigured,
    },
    envConsistencyOk: env.ok,
    envErrors: env.errors,
    envWarnings: env.warnings,
    checkoutReady: status.configured && env.ok,
    allPriceIdsConfigured: missingPrices.length === 0,
    missingEnv: missingPaddleEnvVars(),
    missingPriceIds: missingPrices.map((p) => ({ plan: p.plan, interval: p.interval })),
    webhookUrl: `${appUrl.replace(/\/$/, "")}/api/webhooks/paddle`,
    publicCheckoutEnabled: paddlePublicCheckoutEnabled(),
    ownerTestCheckoutEnabled: paddleOwnerTestCheckoutEnabled(),
    liveModeWarning:
      paddleEnvironment() === "production"
        ? "Production Paddle — live charges apply on checkout."
        : null,
    checkoutUrl: checkoutUrlResolved.ok
      ? {
          mode: checkoutUrlResolved.mode,
          url: checkoutUrlResolved.url,
          displayLabel: checkoutUrlResolved.displayLabel,
          envConfigured: checkoutUrlResolved.envConfigured,
          setupError: null,
          localDevLiveWarning: localDevProductionPaddleWarning(),
        }
      : {
          mode: "default",
          url: null,
          displayLabel: "—",
          envConfigured: Boolean(process.env.PADDLE_CHECKOUT_URL?.trim()),
          setupError: checkoutUrlResolved.error,
          localDevLiveWarning: localDevProductionPaddleWarning(),
        },
    priceRows,
    vercelEnvChecklist,
    paddleCheckoutRecommendations: [
      "Webhook destination URL: https://dreamos86.com/api/webhooks/paddle (Usage type: Both)",
      "Saving payment methods: ON",
      "Marketing consent: ON (optional opt-in; see Privacy Policy)",
      "Run Notification Simulations before enabling public checkout",
      "Do not use Paddle manual Create subscription for self-serve users",
    ],
    warnings,
    recentEvents: extras?.recentEvents ?? [],
    recentCheckoutAttempts: extras?.recentCheckoutAttempts ?? [],
    apiVerify: extras?.apiVerify ?? null,
  };
}

export { getPlanBillingCatalog };
