import { previewReadyMinScore } from "@/lib/build/generated-ui-quality-checker";
import type { GeneratedUiQualityResult } from "@/lib/build/generated-ui-quality-checker";
import {
  countRenderablePages,
  filterRenderableBuildFiles,
  hasRequiredHome,
  hasRequiredLayout,
  type BuildFile,
} from "@/lib/build/generated-file-utils";

export const MIN_RENDERABLE_FILES = 4;
export const MIN_ROUTE_PAGES = 3;

const UNTITLED_RE = /^(untitled app|untitled|new app|new build|dream app)$/i;

export type BuildSuccessContractInput = {
  files: BuildFile[];
  uiQuality: GeneratedUiQualityResult;
  appName: string | null;
  hasIcon: boolean;
  filesPersisted?: number;
};

export type BuildSuccessContractResult = {
  passed: boolean;
  allowed: boolean;
  failures: string[];
  renderableCount: number;
  pageCount: number;
  uiQualityScore: number;
  previewReady: boolean;
  userMessage: string;
};

export function evaluateBuildSuccessContract(
  input: BuildSuccessContractInput,
): BuildSuccessContractResult {
  const renderable = filterRenderableBuildFiles(input.files);
  const failures: string[] = [];

  const name = input.appName?.trim() ?? "";
  if (!name || UNTITLED_RE.test(name)) failures.push("app_name_untitled");
  if (!input.hasIcon && renderable.length < MIN_RENDERABLE_FILES) {
    failures.push("app_icon_missing");
  }

  if (renderable.length < MIN_RENDERABLE_FILES) {
    failures.push(`renderable_files_${renderable.length}_lt_${MIN_RENDERABLE_FILES}`);
  }
  if (!hasRequiredLayout(renderable)) failures.push("missing_app_layout");
  if (!hasRequiredHome(renderable)) failures.push("missing_app_page");

  const pageCount = countRenderablePages(renderable);
  if (pageCount < MIN_ROUTE_PAGES) failures.push(`route_pages_${pageCount}_lt_${MIN_ROUTE_PAGES}`);

  if (renderable.length < MIN_RENDERABLE_FILES) {
    if (!input.uiQuality.passesPreview) {
      failures.push(`ui_quality_${input.uiQuality.score}_lt_${previewReadyMinScore()}`);
    }
    if (input.uiQuality.basicUiFailure) failures.push("ui_too_basic");
  }

  if (typeof input.filesPersisted === "number" && input.filesPersisted < MIN_RENDERABLE_FILES) {
    failures.push(`persisted_${input.filesPersisted}_lt_${MIN_RENDERABLE_FILES}`);
  }

  const passed = failures.length === 0;
  const userMessage = passed
    ? "Preview ready — your first version is ready."
    : failures.some((f) => f.startsWith("ui_quality"))
      ? "Build needs repair — credits were returned. We're improving the interface."
      : failures.some((f) => f.includes("renderable") || f.includes("missing_app"))
        ? "Build needs repair — credits were returned. Generated files were incomplete."
        : "Build needs repair — credits were returned.";

  return {
    passed,
    allowed: passed,
    failures,
    renderableCount: renderable.length,
    pageCount,
    uiQualityScore: input.uiQuality.score,
    previewReady: passed && input.uiQuality.passesPreview,
    userMessage,
  };
}
