import type { AppArchetypeId } from "@/lib/build/app-archetype-classifier";
import {
  countRenderablePages,
  filterRenderableBuildFiles,
  type BuildFile,
} from "@/lib/build/generated-file-utils";
import { countComponentFiles } from "@/lib/build/import-graph";
import { mergeRestaurantInventoryScaffold } from "@/lib/build/restaurant-inventory-scaffold";
import { mergeGenericSaaSScaffold } from "@/lib/build/generic-saas-scaffold";
import { mergeNonprofitCrmScaffold } from "@/lib/build/nonprofit-crm-scaffold";
import {
  STANDARD_MIN_COMPONENTS,
  STANDARD_MIN_RENDERABLE_FILES,
} from "@/lib/build/post-build-contract";

export type ScaffoldFallbackReason =
  | "llm_returned_no_files"
  | "llm_output_too_weak"
  | "below_minimum_renderable"
  | "below_minimum_components"
  | "below_minimum_routes"
  | "not_needed";

export type ScaffoldFallbackResult = {
  files: BuildFile[];
  usedFallback: boolean;
  reason: ScaffoldFallbackReason;
  beforeCount: number;
  afterCount: number;
  componentCount: number;
  pageCount: number;
  archetypeId: AppArchetypeId;
};

const KNOWN_SCAFFOLD_ARCHETYPES = new Set<AppArchetypeId>([
  "restaurant_inventory",
  "saas_dashboard",
  "crm",
  "booking",
  "finance_tracker",
  "ecommerce",
  "marketplace",
  "customer_support",
  "admin_panel",
  "ai_tool",
  "project_management",
  "generic_app",
]);

/** Archetypes with a full deterministic file tree in-repo (expand over time). */
const FULL_SCAFFOLD_ARCHETYPES = new Set<AppArchetypeId>([
  "restaurant_inventory",
  "saas_dashboard",
  "crm",
  "booking",
  "finance_tracker",
  "marketplace",
  "admin_panel",
  "ai_tool",
  "generic_app",
]);

export function hasDeterministicScaffold(archetypeId: string): boolean {
  return KNOWN_SCAFFOLD_ARCHETYPES.has(archetypeId as AppArchetypeId);
}

export function hasFullScaffoldTree(archetypeId: string): boolean {
  return FULL_SCAFFOLD_ARCHETYPES.has(archetypeId as AppArchetypeId);
}

export function mergeScaffoldForArchetype(
  archetypeId: AppArchetypeId,
  files: BuildFile[],
  appName = "Dream App",
): BuildFile[] {
  if (archetypeId === "restaurant_inventory") {
    return mergeRestaurantInventoryScaffold(files);
  }
  if (archetypeId === "crm") {
    return mergeNonprofitCrmScaffold(files, appName);
  }
  if (FULL_SCAFFOLD_ARCHETYPES.has(archetypeId)) {
    return mergeGenericSaaSScaffold(archetypeId, files, appName);
  }
  return files;
}

export function isWeakBuildOutput(files: BuildFile[], archetypeId: string): boolean {
  const renderable = filterRenderableBuildFiles(files);
  if (renderable.length === 0) return true;
  if (!hasFullScaffoldTree(archetypeId)) {
    return renderable.length < STANDARD_MIN_RENDERABLE_FILES;
  }
  if (renderable.length < STANDARD_MIN_RENDERABLE_FILES) return true;
  if (countComponentFiles(renderable) < STANDARD_MIN_COMPONENTS) return true;
  if (countRenderablePages(renderable) < 5) return true;
  return false;
}

/**
 * Apply locked scaffold before contract validation — never allow known archetypes to hit `no_files`.
 */
export function applyArchetypeScaffoldFallback(
  archetypeId: string,
  files: BuildFile[],
  appName = "Dream App",
): ScaffoldFallbackResult {
  const id = archetypeId as AppArchetypeId;
  const before = filterRenderableBuildFiles(files);
  const beforeCount = before.length;

  if (!hasFullScaffoldTree(id)) {
    return {
      files,
      usedFallback: false,
      reason: "not_needed",
      beforeCount,
      afterCount: beforeCount,
      componentCount: countComponentFiles(before),
      pageCount: countRenderablePages(before),
      archetypeId: id,
    };
  }

  const weak = isWeakBuildOutput(files, id);
  if (!weak && beforeCount >= STANDARD_MIN_RENDERABLE_FILES) {
    return {
      files,
      usedFallback: false,
      reason: "not_needed",
      beforeCount,
      afterCount: beforeCount,
      componentCount: countComponentFiles(before),
      pageCount: countRenderablePages(before),
      archetypeId: id,
    };
  }

  let reason: ScaffoldFallbackReason = "not_needed";
  if (beforeCount === 0) reason = "llm_returned_no_files";
  else if (countComponentFiles(before) < STANDARD_MIN_COMPONENTS) reason = "below_minimum_components";
  else if (countRenderablePages(before) < 5) reason = "below_minimum_routes";
  else if (beforeCount < STANDARD_MIN_RENDERABLE_FILES) reason = "below_minimum_renderable";
  else reason = "llm_output_too_weak";

  const merged = filterRenderableBuildFiles(mergeScaffoldForArchetype(id, files, appName));
  return {
    files: merged,
    usedFallback: true,
    reason,
    beforeCount,
    afterCount: merged.length,
    componentCount: countComponentFiles(merged),
    pageCount: countRenderablePages(merged),
    archetypeId: id,
  };
}

export type BuildFailureRootCause =
  | "llm_returned_no_files"
  | "scaffold_not_applied"
  | "generated_files_dropped_before_contract"
  | "contract_rejected_valid_files"
  | "repair_not_run"
  | "repair_returned_no_files"
  | "persistence_not_reached"
  | "persistence_failed"
  | "files_cleared_after_failure"
  | "wrong_project_id"
  | "rls_hidden_files"
  | "timeout_before_generation_finished"
  | "unknown";

export function classifyBuildFailureRootCause(input: {
  archetypeId: string;
  scaffoldUsed: boolean;
  renderableBeforeFallback: number;
  renderableAfterFallback: number;
  contractPassed: boolean;
  contractFailures: string[];
  persistReached: boolean;
  persistOk: boolean;
  persistedCount: number;
  filesClearedAfterFailure: boolean;
}): BuildFailureRootCause {
  if (input.filesClearedAfterFailure && input.persistedCount === 0 && input.contractPassed) {
    return "files_cleared_after_failure";
  }
  if (!input.contractPassed && input.renderableAfterFallback > 0) {
    if (input.contractFailures.some((f) => f.includes("persisted") || f.includes("db_read"))) {
      return input.persistOk ? "rls_hidden_files" : "persistence_failed";
    }
    return "contract_rejected_valid_files";
  }
  if (!input.scaffoldUsed && input.renderableBeforeFallback === 0) {
    return hasFullScaffoldTree(input.archetypeId) ? "scaffold_not_applied" : "llm_returned_no_files";
  }
  if (!input.persistReached && input.contractPassed) return "persistence_not_reached";
  if (input.persistReached && !input.persistOk) return "persistence_failed";
  if (!input.contractPassed && input.renderableAfterFallback === 0) {
    return input.scaffoldUsed ? "generated_files_dropped_before_contract" : "llm_returned_no_files";
  }
  return "unknown";
}
