const REJECT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bSample Item\b/i, reason: "contains placeholder Sample Item" },
  { pattern: /\bLorem ipsum\b/i, reason: "contains lorem ipsum" },
  { pattern: /\bTODO:\s*implement\b/i, reason: "contains TODO placeholders" },
];

export type BuildQualityResult = {
  ok: boolean;
  reasons: string[];
  pageCount: number;
  fileCount: number;
};

export function validateGeneratedBuild(files: Array<{ path: string; content: string }>): BuildQualityResult {
  const reasons: string[] = [];
  const combined = files.map((f) => f.content).join("\n");

  for (const { pattern, reason } of REJECT_PATTERNS) {
    if (pattern.test(combined)) reasons.push(reason);
  }

  const pagePaths = files.filter(
    (f) =>
      /\/(page|pages)\//i.test(f.path) ||
      /\/app\/[^/]+\/page\./i.test(f.path) ||
      /\.html$/i.test(f.path),
  );
  const previewOnly =
    files.length <= 2 && files.every((f) => f.path.includes("preview"));
  if (previewOnly) reasons.push("only preview file generated");
  if (pagePaths.length < 1 && !files.some((f) => f.path.endsWith(".html"))) {
    reasons.push("no pages or screens detected");
  }

  const genericDashboardOnly =
    files.length <= 3 &&
    /dashboard/i.test(combined) &&
    !/inventory|supplier|order|alert|analytics/i.test(combined);
  if (genericDashboardOnly) reasons.push("generic single-dashboard output");

  return {
    ok: reasons.length === 0,
    reasons,
    pageCount: pagePaths.length,
    fileCount: files.length,
  };
}
