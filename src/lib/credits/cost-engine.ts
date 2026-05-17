/**
 * DreamOS86 — Profitability Cost Engine
 *
 * RULE: Credits consumed by users must be >= 3x the actual provider cost.
 * This ensures the platform remains profitable at every request.
 *
 * Credit pricing is defined per model and validated here.
 * Every model's credit cost is calculated as:
 *   userCreditCost = max(MIN_CREDITS, ceil(providerCostUsd * MARGIN_MULTIPLIER * CREDITS_PER_USD))
 *
 * Current exchange rate: 1 credit ≈ $0.002 user value
 * Minimum required: 3x actual provider cost
 */

export const MARGIN_MULTIPLIER = 3;

/** How many DreamOS86 credits equate to $1 of user billing value */
export const CREDITS_PER_USD = 50; // 50 credits = $1 → 1 credit = $0.02

/**
 * Estimated provider cost per request (in USD).
 * Based on public API pricing × typical token usage (2k in + 4k out per generation).
 * These are conservative estimates — actual costs may be lower.
 */
const PROVIDER_COST_USD: Record<string, number> = {
  // Anthropic
  "claude-opus-4-7":    0.18,   // ~$15/M input, $75/M output (Opus 4 tier)
  "claude-opus-4-6":    0.12,   // ~$12/M input, $60/M output
  "claude-sonnet-4-6":  0.04,   // ~$3/M input, $15/M output
  "claude-haiku-4-5":   0.008,  // ~$0.80/M input, $4/M output

  // OpenAI
  "gpt-5-5":           0.16,   // ~$12/M input, $60/M output
  "gpt-5-4":           0.08,   // ~$6/M input, $30/M output
  "gpt-4o":            0.05,   // ~$5/M input, $15/M output
  "gpt-4o-mini":       0.004,  // ~$0.15/M input, $0.60/M output

  // Google
  "gemini-2-5-pro":    0.06,   // ~$3.5/M input, $10.5/M output (blended)
  "gemini-2-0-flash":  0.008,  // ~$0.075/M input, $0.30/M output
  "gemini-flash":      0.004,  // ~$0.075/M input, $0.30/M output

  // DeepSeek
  "deepseek-chat":     0.007,  // ~$0.27/M input, $1.10/M output
  "deepseek-reasoner": 0.015,  // ~$0.55/M input, $2.19/M output

  // xAI
  "grok-4":            0.12,   // ~$5/M input, $25/M output

  // Meta
  "llama-4-maverick":  0.012,  // ~$0.18/M input, $0.59/M output

  // Cohere
  "command-r-plus":    0.025,  // ~$2.5/M input, $10/M output

  // Mistral
  "mistral-large":     0.018,  // ~$2/M input, $6/M output
};

/**
 * Minimum credit cost per request, regardless of model.
 * Covers infrastructure overhead (compute, storage, egress).
 */
const MIN_CREDITS_PER_REQUEST = 1;

/**
 * Orchestration complexity multipliers by creation mode.
 * 'discuss' = single turn; 'build' = full multi-agent pipeline.
 */
const MODE_MULTIPLIER: Record<string, number> = {
  discuss: 1.0,
  edit:    1.4,
  build:   2.2,
};

/**
 * Calculates the number of credits to deduct for a generation request.
 * Guarantees >= 3x margin over estimated provider cost.
 */
export function calculateCredits(
  modelId: string,
  mode: "discuss" | "edit" | "build" = "discuss",
  contextMultiplier = 1.0, // 1.0 = normal context; >1 = long context (Gemini 1M etc.)
): number {
  const providerCostUsd = PROVIDER_COST_USD[modelId] ?? 0.04;
  const modeMultiplier = MODE_MULTIPLIER[mode] ?? 1.0;

  // Total cost with mode complexity and context overhead
  const adjustedCostUsd = providerCostUsd * modeMultiplier * Math.max(1, contextMultiplier);

  // Apply 3x margin and convert to credits
  const requiredCredits = adjustedCostUsd * MARGIN_MULTIPLIER * CREDITS_PER_USD;

  return Math.max(MIN_CREDITS_PER_REQUEST, Math.ceil(requiredCredits));
}

/**
 * Returns the profitability ratio for a given credit cost vs. provider cost.
 * A ratio >= MARGIN_MULTIPLIER (3.0) means the platform is profitable.
 */
export function getProfitabilityRatio(
  credits: number,
  modelId: string,
): number {
  const providerCostUsd = PROVIDER_COST_USD[modelId] ?? 0.04;
  const userRevenueUsd = credits / CREDITS_PER_USD;
  return userRevenueUsd / providerCostUsd;
}

/**
 * Validates that a model's credit cost meets the minimum margin requirement.
 * Used in tests and admin dashboards.
 */
export function validateModelMargin(
  modelId: string,
  credits: number,
  mode: "discuss" | "edit" | "build" = "discuss",
): { valid: boolean; ratio: number; minRequired: number } {
  const ratio = getProfitabilityRatio(credits, modelId);
  const effectiveMultiplier = MODE_MULTIPLIER[mode] ?? 1.0;
  const minRequired = MARGIN_MULTIPLIER * effectiveMultiplier;
  return { valid: ratio >= MARGIN_MULTIPLIER, ratio, minRequired };
}

/**
 * Get the recommended credit cost for all models to ensure profitability.
 * Useful for admin dashboards and pricing validation scripts.
 */
export function getRecommendedCreditCosts(): Record<string, { discuss: number; edit: number; build: number }> {
  const result: Record<string, { discuss: number; edit: number; build: number }> = {};
  for (const modelId of Object.keys(PROVIDER_COST_USD)) {
    result[modelId] = {
      discuss: calculateCredits(modelId, "discuss"),
      edit:    calculateCredits(modelId, "edit"),
      build:   calculateCredits(modelId, "build"),
    };
  }
  return result;
}
