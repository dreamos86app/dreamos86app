/** Valid relative paths for workflow file cards (repo-style app files). */
const WORKFLOW_FILE_PATH_RE =
  /^(?:src\/)?(?:app|components|lib|hooks|styles|public|content|data|types|utils|config|middleware|package\.json|tsconfig\.json|next\.config\.[jt]s|tailwind\.config\.[jt]s|postcss\.config\.[jt]s|README\.md)(?:\/[\w@.\-[\]]+)+\.(?:tsx|ts|jsx|js|mjs|cjs|css|json|md|svg)$/i;

const FORBIDDEN_PATH_FRAGMENT =
  /generating|adding the required|frontend files|backend files|weak_output|repair|scaffold|pipeline|worker/i;

export function isValidWorkflowFilePath(path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  const p = path.trim().replace(/\\/g, "/");
  if (p.length < 4 || p.length > 220) return false;
  if (p.includes("..") || p.startsWith("/")) return false;
  if (FORBIDDEN_PATH_FRAGMENT.test(p)) return false;
  if (!p.includes(".")) return false;
  return WORKFLOW_FILE_PATH_RE.test(p) || /^[\w@.\-[\]/]+\.(tsx|ts|jsx|js|css|json|md|svg)$/i.test(p);
}

export function extractWorkflowFilePath(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const text = raw.trim();
    const created = text.match(/^(?:Created|Updated|Edited|Deleted)\s+(.+)$/i);
    const path = (created?.[1] ?? text).trim();
    if (isValidWorkflowFilePath(path)) return path;
    const embedded = text.match(
      /(?:^|\s)((?:src\/)?(?:app|components|lib)\/[\w@./\-[\]]+\.(?:tsx|ts|jsx|js|css|json))/i,
    );
    if (embedded && isValidWorkflowFilePath(embedded[1])) return embedded[1];
  }
  return null;
}
