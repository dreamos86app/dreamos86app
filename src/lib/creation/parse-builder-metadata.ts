/** Structured app metadata block emitted by the builder model. */

export type BuilderAppMeta = {
  name?: string;
  slug?: string;
  description?: string;
  category?: string;
  theme?: Record<string, unknown>;
};

export type BuilderOutputContract = {
  app?: BuilderAppMeta;
  plan?: string[];
  steps?: string[];
  pages?: string[];
  entities?: string[];
  files?: Array<{ path: string; action?: string }>;
  preview?: Record<string, unknown>;
  summary?: string;
};

const META_FENCE = /```(?:json)?\s*dreamos-app-meta\s*\n([\s\S]*?)```/i;
const META_LINE = /<!--\s*DREAMOS_APP_META\s*([\s\S]*?)\s*-->/i;

export function extractBuilderMetadata(text: string): BuilderOutputContract | null {
  if (!text.trim()) return null;

  let raw: string | null = null;
  const fence = text.match(META_FENCE);
  if (fence?.[1]) raw = fence[1].trim();
  if (!raw) {
    const line = text.match(META_LINE);
    if (line?.[1]) raw = line[1].trim();
  }
  if (!raw) {
    const loose = text.match(/\{\s*"app"\s*:\s*\{[\s\S]{20,4000}\}\s*,\s*"plan"/);
    if (loose) raw = loose[0];
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as BuilderOutputContract;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function slugifyAppName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "app";
}
