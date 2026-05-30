/**
 * Model-mix routing — automatic vs user-selected main model.
 * Helper models (planning/compression/summary) stay cheap and hidden from users.
 */
import type { AiOperationType } from "@/lib/ai/operation-types";
import { isAutomaticModelId } from "@/lib/ai/resolve-automatic-model";
import { pickCheapDiscussModel, pickCheapPlannerModel } from "@/lib/ai/cheap-planner";
import { routeHeavyTask } from "@/lib/ai/heavy-task-router";
import { pickFailoverCatalogModel, providerFromModelId } from "@/lib/ai/provider-errors";
import { isProviderSelectable } from "@/lib/ai/provider-availability";
import { isHeavyModelOperation } from "@/lib/ai/model-orchestration-policy";
import { routeOperation } from "@/lib/ai/model-router";
import { loadSmokeRoutingConfig } from "@/lib/ai/smoke-routing-loader";
export { DEFAULT_SMOKE_ROUTING } from "@/lib/ai/smoke-routing-loader";

export type ModelMixMode = "discuss" | "planning" | "edit" | "build" | "repair" | "summary";

export type ModelMixResolution = {
  mode: ModelMixMode;
  automatic: boolean;
  userSelectedModelId: string | null;
  helperModelId: string;
  mainModelId: string;
  mainProvider: ReturnType<typeof providerFromModelId>;
  helperProvider: ReturnType<typeof providerFromModelId>;
  fallbackApplied: boolean;
  fallbackReason: string | null;
  policyNote: string;
};

function modeFromOperation(op: AiOperationType): ModelMixMode {
  if (op.startsWith("discuss")) return "discuss";
  if (op === "build_plan" || op === "normalize_prompt" || op === "build_intake") return "planning";
  if (op.startsWith("edit")) return "edit";
  if (op.includes("repair")) return "repair";
  if (op === "diagnostics_summary") return "summary";
  if (isHeavyModelOperation(op)) return "build";
  return "planning";
}

function pickHelperModel(): { modelId: string; reason: string } {
  const cheap = pickCheapDiscussModel(null);
  if (cheap.modelId) return { modelId: cheap.modelId, reason: "cheap_helper_discuss" };
  const planner = pickCheapPlannerModel();
  return { modelId: planner.modelId, reason: planner.reason };
}

function pickAutomaticMainModel(mode: ModelMixMode, complexity: number): string {
  const routing = loadSmokeRoutingConfig();
  if (mode === "discuss" || mode === "summary") {
    return pickCheapDiscussModel(null).modelId;
  }
  if (mode === "planning") {
    return pickCheapPlannerModel().modelId;
  }
  if (mode === "edit" && complexity < 7) {
    return routing.bestEdit || pickCheapDiscussModel(null).modelId;
  }
  if (mode === "build" || mode === "repair" || (mode === "edit" && complexity >= 7)) {
    const heavy = routeHeavyTask("backend_implementation", { complexity });
    return heavy.modelId;
  }
  return pickCheapPlannerModel().modelId;
}

function ensureSelectable(modelId: string, operationType: AiOperationType): {
  modelId: string;
  fallbackApplied: boolean;
  fallbackReason: string | null;
} {
  const routing = loadSmokeRoutingConfig();
  const provider = providerFromModelId(modelId);
  if (isProviderSelectable(provider)) {
    return { modelId, fallbackApplied: false, fallbackReason: null };
  }
  const alt = pickFailoverCatalogModel(provider, operationType);
  if (alt) {
    return {
      modelId: alt,
      fallbackApplied: true,
      fallbackReason: `failover_from_${provider}`,
    };
  }
  if (provider === "anthropic" && !isProviderSelectable("anthropic")) {
    return {
      modelId: routing.fallbackWhenClaudeUnavailable,
      fallbackApplied: true,
      fallbackReason: "anthropic_unavailable",
    };
  }
  if (provider === "openai" && !isProviderSelectable("openai")) {
    return {
      modelId: routing.fallbackWhenOpenAiUnavailable,
      fallbackApplied: true,
      fallbackReason: "openai_unavailable",
    };
  }
  if (provider === "google" && !isProviderSelectable("google")) {
    return {
      modelId: routing.fallbackWhenGeminiUnavailable,
      fallbackApplied: true,
      fallbackReason: "google_unavailable",
    };
  }
  return { modelId, fallbackApplied: false, fallbackReason: null };
}

/**
 * Resolve helper + main models for an operation.
 * User-selected model is used for main heavy work only; helper stays cheap.
 */
export function resolveModelMix(input: {
  operationType: AiOperationType;
  userSelectedModelId?: string | null;
  complexity?: number;
  ownerEmail?: string | null;
}): ModelMixResolution {
  const mode = modeFromOperation(input.operationType);
  const complexity = input.complexity ?? 5;
  const automatic = isAutomaticModelId(input.userSelectedModelId);
  const helper = pickHelperModel();

  let mainModelId: string;
  let policyNote: string;

  if (automatic) {
    mainModelId = pickAutomaticMainModel(mode, complexity);
    policyNote = "automatic_model_mix";
  } else {
    mainModelId = input.userSelectedModelId!.trim();
    policyNote = "user_selected_primary_only";
  }

  const ensured = ensureSelectable(mainModelId, input.operationType);
  mainModelId = ensured.modelId;

  return {
    mode,
    automatic,
    userSelectedModelId: automatic ? null : (input.userSelectedModelId ?? null),
    helperModelId: helper.modelId,
    mainModelId,
    mainProvider: providerFromModelId(mainModelId),
    helperProvider: providerFromModelId(helper.modelId),
    fallbackApplied: ensured.fallbackApplied,
    fallbackReason: ensured.fallbackReason,
    policyNote,
  };
}

/** Route spec for the main model call (respects user selection + fallbacks). */
export function routeMainModelSpec(input: {
  operationType: AiOperationType;
  userSelectedModelId?: string | null;
  complexity?: number;
  ownerEmail?: string | null;
}) {
  const mix = resolveModelMix(input);
  const spec = routeOperation({
    operationType: input.operationType,
    requestedModelId: mix.mainModelId,
    complexity: input.complexity,
    ownerEmail: input.ownerEmail,
  });
  return { mix, spec };
}
