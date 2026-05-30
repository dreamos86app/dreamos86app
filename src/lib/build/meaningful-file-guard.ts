import type { BuildFile } from "@/lib/build/generated-file-utils";
import { normalizeBuildFilePath } from "@/lib/build/generated-file-utils";

const REDIRECT_ONLY_RE =
  /import\s+\{[^}]*redirect[^}]*\}\s+from\s+["']next\/navigation["'][\s\S]*export\s+default\s+function\s+\w*\s*\(\s*\)\s*\{\s*redirect\(/;

function meaningfulLineCount(content: string): number {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*")).length;
}

export function isThinGeneratedFile(file: BuildFile): boolean {
  const path = normalizeBuildFilePath(file.path);
  const lines = meaningfulLineCount(file.content ?? "");
  if (path === "package.json" || path.endsWith("globals.css")) return lines < 3;
  if (/(^|\/)page\.(tsx|jsx)$/i.test(path)) {
    if (REDIRECT_ONLY_RE.test(file.content)) return false;
    return lines < 12;
  }
  if (/^components\//i.test(path)) return lines < 15;
  if (/^lib\//i.test(path)) return lines < 10;
  return lines < 5;
}

export function countThinFiles(files: BuildFile[]): number {
  return files.filter(isThinGeneratedFile).length;
}
