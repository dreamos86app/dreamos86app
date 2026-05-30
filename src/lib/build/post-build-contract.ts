/**
 * Mandatory post-build contract — blocks fake/incomplete builds from marking success.
 */
import { validateGeneratedApp } from "@/lib/build/generated-app-validator";
import {
  countComponentFiles,
  findMissingRelativeImports,
} from "@/lib/build/import-graph";
import {
  evaluateBuildSuccessContract,
  MIN_RENDERABLE_FILES,
  type BuildSuccessContractResult,
} from "@/lib/build/build-success-contract";
import {
  checkGeneratedUiQuality,
  type GeneratedUiQualityResult,
} from "@/lib/build/generated-ui-quality-checker";
import { PREVIEW_READY_MIN_SCORE } from "@/lib/build/ui-quality-contract";
import { repairBuildFiles } from "@/lib/build/build-contract-repair";
import { mergeScaffoldForArchetype } from "@/lib/build/archetype-scaffold-fallback";
import type { AppArchetypeId } from "@/lib/build/app-archetype-classifier";
import {
  countRenderablePages,
  filterRenderableBuildFiles,
  type BuildFile,
} from "@/lib/build/generated-file-utils";

export const STANDARD_MIN_ROUTE_PAGES = 5;
export const STANDARD_MIN_COMPONENTS = 5;
export const STANDARD_MIN_RENDERABLE_FILES = 8;

export type PostBuildContractInput = {
  files: BuildFile[];
  appName: string | null;
  hasIcon: boolean;
  routeMap?: string[] | null;
  requiredPageSlugs?: string[] | null;
  tier?: "small" | "standard" | "advanced";
  projectId?: string | null;
  ownerId?: string | null;
  appType?: string | null;
  /** When true, strip `no_files` / empty-file failures — scaffold guarantees a tree. */
  scaffoldFallbackUsed?: boolean;
  archetypeId?: string | null;
};

export type PostBuildContractResult = {
  passed: boolean;
  failures: string[];
  missingImports: ReturnType<typeof findMissingRelativeImports>;
  renderableCount: number;
  pageCount: number;
  componentCount: number;
  uiQuality: GeneratedUiQualityResult;
  validationOk: boolean;
  buildContract: BuildSuccessContractResult;
  userMessage: string;
  needsRepair: boolean;
};

function requiredPagesMissing(files: BuildFile[], slugs: string[]): string[] {
  const pathList = files.map((f) => f.path.toLowerCase());
  const pathsBlob = pathList.join("\n");
  return slugs.filter((slug) => {
    const s = slug.replace(/^\//, "").toLowerCase();
    if (s === "dashboard" || s === "home") {
      const hasDashboard = pathList.some((p) => /(^|\/)app\/page\.(tsx|jsx|js)$/i.test(p) || /dashboard/i.test(p));
      return !hasDashboard;
    }
    const hasPage =
      pathList.some((p) => p.includes(`app/${s}/page.`)) ||
      pathsBlob.includes(`app/${s}/page`) ||
      pathsBlob.includes(s);
    return !hasPage;
  });
}

const COSMETIC_FAILURE_PREFIXES = [
  "app_icon_missing",
  "app_name_untitled",
  "ui_quality_",
  "ui_too_basic",
] as const;

/** Failures that must not block preview or show repair UI when files were saved. */
export function isCosmeticOnlyBuildFailure(failures: string[]): boolean {
  if (failures.length === 0) return false;
  return failures.every((f) =>
    COSMETIC_FAILURE_PREFIXES.some((p) => f === p || f.startsWith(p)),
  );
}

const NON_BLOCKING_WITH_SAVED_FILES_RE =
  /^(app_icon_missing|app_name_untitled|ui_too_basic|missing_app_layout|missing_app_page)$|^ui_quality_|^route_pages_|^components_|^renderable_files_/;

/** Enough files saved — preview is useful even if quality/icon checks did not pass. */
export function canCompleteWithSavedFiles(fileCount: number, failures: string[]): boolean {
  if (fileCount < MIN_RENDERABLE_FILES) return false;
  if (failures.length === 0) return true;
  return failures.every(
    (f) => NON_BLOCKING_WITH_SAVED_FILES_RE.test(f) || f.startsWith("persisted_"),
  );
}

export { MIN_RENDERABLE_FILES };

export function evaluatePostBuildContract(input: PostBuildContractInput): PostBuildContractResult {
  const renderable = filterRenderableBuildFiles(input.files);
  const uiQuality = checkGeneratedUiQuality({
    files: renderable,
    appType: input.appType ?? null,
    stylePresetId: null,
    routeMap: input.routeMap,
  });

  const validation = validateGeneratedApp({
    files: renderable,
    projectId: input.projectId,
    ownerId: input.ownerId,
    routeMap: input.routeMap,
  });

  const buildContract = evaluateBuildSuccessContract({
    files: renderable,
    uiQuality,
    appName: input.appName,
    hasIcon: input.hasIcon,
  });

  const missingImports = findMissingRelativeImports(renderable);
  const failures = [...buildContract.failures];

  if (missingImports.length > 0) {
    failures.push(`missing_imports:${missingImports.length}`);
    for (const mi of missingImports.slice(0, 5)) {
      failures.push(`missing_import:${mi.fromFile}:${mi.specifier}`);
    }
  }

  if (!validation.ok) {
    for (const r of validation.reasons.slice(0, 8)) {
      if (input.scaffoldFallbackUsed && (r === "no_files" || r === "no_page_route")) continue;
      if (!failures.includes(r)) failures.push(r);
    }
  }

  const tier = input.tier ?? "standard";
  const pageCount = countRenderablePages(renderable);
  const componentCount = countComponentFiles(renderable);

  if (tier === "standard" || tier === "advanced") {
    if (pageCount < STANDARD_MIN_ROUTE_PAGES) {
      failures.push(`route_pages_${pageCount}_lt_${STANDARD_MIN_ROUTE_PAGES}`);
    }
    if (componentCount < STANDARD_MIN_COMPONENTS) {
      failures.push(`components_${componentCount}_lt_${STANDARD_MIN_COMPONENTS}`);
    }
    if (renderable.length < STANDARD_MIN_RENDERABLE_FILES) {
      failures.push(`renderable_files_${renderable.length}_lt_${STANDARD_MIN_RENDERABLE_FILES}`);
    }
  }

  if (uiQuality.score < PREVIEW_READY_MIN_SCORE) {
    if (!failures.some((f) => f.startsWith("ui_quality"))) {
      failures.push(`ui_quality_${uiQuality.score}_lt_${PREVIEW_READY_MIN_SCORE}`);
    }
  }

  if (input.requiredPageSlugs?.length) {
    const missingPages = requiredPagesMissing(renderable, input.requiredPageSlugs);
    if (missingPages.length) {
      failures.push(`required_pages_missing:${missingPages.join(",")}`);
    }
  }

  const scaffoldWaived = (f: string) =>
    f === "no_files" ||
    f === "app_icon_missing" ||
    f === "no_page_route" ||
    f.startsWith("renderable_files_0") ||
    f.startsWith("renderable_files_1") ||
    f.startsWith("renderable_files_2") ||
    f.startsWith("renderable_files_3") ||
    f.startsWith("missing_app_layout") ||
    f.startsWith("missing_app_page") ||
    f.startsWith("route_pages_0") ||
    f.startsWith("route_pages_1") ||
    f.startsWith("route_pages_2") ||
    f.startsWith("components_0") ||
    f.startsWith("components_1") ||
    f.startsWith("components_2") ||
    f.startsWith("components_3") ||
    f.startsWith("components_4") ||
    (f.startsWith("ui_quality_0") && uiQuality.score >= PREVIEW_READY_MIN_SCORE) ||
    (f === "ui_too_basic" && uiQuality.score >= PREVIEW_READY_MIN_SCORE);

  let filteredFailures = failures;
  if (input.scaffoldFallbackUsed) {
    filteredFailures = failures.filter((f) => !scaffoldWaived(f));
  }

  const contractOk = Boolean(
    input.scaffoldFallbackUsed
      ? filteredFailures.filter((f) => !f.startsWith("ui_quality")).length === 0 &&
          uiQuality.score >= PREVIEW_READY_MIN_SCORE
      : buildContract.passed,
  );

  const cosmeticOnly =
    renderable.length >= STANDARD_MIN_RENDERABLE_FILES &&
    isCosmeticOnlyBuildFailure(filteredFailures) &&
    missingImports.length === 0;

  const passed = Boolean(
    cosmeticOnly ||
      (filteredFailures.length === 0 &&
        contractOk &&
        missingImports.length === 0 &&
        (validation.ok ||
          (input.scaffoldFallbackUsed && renderable.length >= STANDARD_MIN_RENDERABLE_FILES))),
  );

  const hasRenderableFiles = renderable.length > 0;
  const userMessage = passed
    ? "Preview ready — your first version is ready."
    : !hasRenderableFiles
      ? "I couldn't generate files for this request. Try again or simplify your prompt."
      : missingImports.length > 0
        ? "Generated files reference components that were not created — a repair pass can fix this."
        : failures.some((f) => f.startsWith("ui_quality"))
          ? "The first version was saved, but UI quality needs a repair pass before preview."
          : "The first version was saved, but some checks did not pass yet.";

  return {
    passed,
    failures: filteredFailures,
    missingImports,
    renderableCount: renderable.length,
    pageCount,
    componentCount,
    uiQuality,
    validationOk: validation.ok,
    buildContract: {
      ...buildContract,
      passed: contractOk,
      failures: input.scaffoldFallbackUsed ? filteredFailures : buildContract.failures,
      userMessage,
    },
    userMessage,
    needsRepair: !passed,
  };
}

export type PostBuildContractEnforcementResult = {
  files: BuildFile[];
  contract: PostBuildContractResult;
  repairPasses: number;
};

/** Run up to `maxPasses` deterministic repairs, then re-validate. */
export function enforcePostBuildContractWithRepair(
  input: PostBuildContractInput,
  maxPasses = 2,
): PostBuildContractEnforcementResult {
  let files = input.files;
  let contract = evaluatePostBuildContract({ ...input, files });
  let repairPasses = 0;

  while (repairPasses < maxPasses && !contract.passed) {
    const canRepair =
      contract.missingImports.length > 0 ||
      contract.failures.some(
        (f) =>
          f.startsWith("route_pages_") ||
          f.startsWith("components_") ||
          f.startsWith("required_pages_missing") ||
          f.startsWith("missing_blueprint_routes") ||
          f.startsWith("ui_quality") ||
          f.startsWith("renderable_files"),
      );
    if (!canRepair) break;

    if (input.scaffoldFallbackUsed && input.archetypeId) {
      files = mergeScaffoldForArchetype(
        input.archetypeId as AppArchetypeId,
        files,
        input.appName ?? "Dream App",
      );
    }

    files = repairBuildFiles({
      files,
      missingImports: contract.missingImports,
      requiredPageSlugs: input.requiredPageSlugs ?? undefined,
    });
    repairPasses += 1;
    contract = evaluatePostBuildContract({ ...input, files });
  }

  return { files, contract, repairPasses };
}

export function requiredPageSlugsForArchetype(archetypeId: string): string[] | null {
  if (archetypeId === "restaurant_inventory") {
    return ["dashboard", "inventory", "suppliers", "alerts", "settings"];
  }
  if (archetypeId === "crm") {
    return ["donors", "donations", "campaigns", "recurring-gifts", "automations", "settings"];
  }
  return null;
}
