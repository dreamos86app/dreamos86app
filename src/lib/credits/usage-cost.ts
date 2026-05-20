/**
 * Owner-facing provider cost estimates (USD) for admin analytics.
 * User credits use calculateTokens (3× margin) in cost-engine.ts.
 */

const PROVIDER_COST_USD: Record<string, number> = {
  "claude-opus-4-7": 0.18,
  "claude-opus-4-6": 0.12,
  "claude-sonnet-4-6": 0.04,
  "claude-haiku-4-5": 0.008,
  "gpt-5-5": 0.16,
  "gpt-5-4": 0.08,
  "gpt-4o": 0.05,
  "gpt-4o-mini": 0.004,
  "gemini-2-5-pro": 0.06,
  "gemini-2-0-flash": 0.008,
  "gemini-2.0-flash": 0.008,
  "gemini-flash": 0.004,
  "deepseek-chat": 0.007,
  "deepseek-reasoner": 0.015,
  "grok-4": 0.12,
  "llama-4-maverick": 0.012,
  "command-r-plus": 0.025,
  "mistral-large": 0.018,
};

const MODE_MULTIPLIER: Record<string, number> = {
  discuss: 1,
  edit: 1.4,
  build: 2.2,
};

export function estimateProviderCostUsd(
  modelId: string,
  mode: string,
  tokensInput?: number | null,
  tokensOutput?: number | null,
): number {
  const base = PROVIDER_COST_USD[modelId] ?? 0.04;
  const modeMul = MODE_MULTIPLIER[mode] ?? 1;
  const inTok = tokensInput ?? 2000;
  const outTok = tokensOutput ?? 4000;
  const tokenScale = Math.min(3, (inTok + outTok) / 6000);
  return base * modeMul * Math.max(0.5, tokenScale);
}

export function estimateOwnerRevenueUsd(creditsCharged: number): number {
  return creditsCharged / 50;
}

export function estimateOwnerMarginUsd(
  creditsCharged: number,
  providerCostUsd: number,
): number {
  return estimateOwnerRevenueUsd(creditsCharged) - providerCostUsd;
}
