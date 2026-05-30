import { mergeNonprofitCrmScaffold } from "@/lib/build/nonprofit-crm-scaffold";
import {
  buildRestaurantInventoryPreviewBody,
  isRestaurantInventoryPreview,
} from "@/lib/preview/restaurant-static-preview";
import {
  isCrmLikeArchetype,
  previewArchetypeMismatch,
} from "@/lib/preview/preview-archetype-guard";
import {
  injectDreamOSBrandingIntoPreviewHtml,
  type GeneratedAppBrandingOptions,
} from "@/lib/branding/generated-app-branding";

export type PreviewHtmlOptions = {
  projectId?: string;
  previewSessionId?: string;
  buildJobId?: string | null;
  snapshotHash?: string | null;
  archetypeId?: string | null;
  branding?: GeneratedAppBrandingOptions;
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function wrapPreviewDocument(bodyInner: string, options?: PreviewHtmlOptions): string {
  const rootAttrs = [
    'id="dreamos-preview-root"',
    'data-testid="generated-app-preview-root"',
    'data-preview-ready="true"',
    options?.projectId ? `data-project-id="${escapeAttr(options.projectId)}"` : "",
    options?.previewSessionId
      ? `data-preview-session-id="${escapeAttr(options.previewSessionId)}"`
      : "",
    options?.buildJobId ? `data-build-job-id="${escapeAttr(options.buildJobId)}"` : "",
    options?.snapshotHash ? `data-snapshot-hash="${escapeAttr(options.snapshotHash)}"` : "",
    options?.archetypeId ? `data-archetype-id="${escapeAttr(options.archetypeId)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>DreamOS86 Preview</title>
  <meta name="dreamos-preview" content="static-snapshot" />
  <style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased">
  <div ${rootAttrs} class="min-h-screen">${bodyInner}</div>
</body>
</html>`;
  return injectDreamOSBrandingIntoPreviewHtml(doc, options?.branding ?? {});
}

/** Build a self-contained HTML snapshot from generated files. */
export function buildStaticPreviewHtml(
  files: Array<{ path: string; content: string }>,
  options?: PreviewHtmlOptions,
): string {
  if (files.length === 0 && options?.archetypeId === "restaurant_inventory") {
    return wrapPreviewDocument(buildRestaurantInventoryPreviewBody(), options);
  }

  const indexHtml = files.find((f) => f.path === "index.html" || f.path.endsWith("/index.html"));
  if (indexHtml?.content?.trim()) {
    if (indexHtml.content.includes("generated-app-preview-root")) return indexHtml.content;
    return wrapPreviewDocument(
      indexHtml.content.replace(/<\/?html[^>]*>|<\/?head[^>]*>|<\/?body[^>]*>/gi, ""),
      options,
    );
  }

  if (isRestaurantInventoryPreview(files, options?.archetypeId)) {
    return wrapPreviewDocument(buildRestaurantInventoryPreviewBody(), options);
  }

  if (isCrmLikeArchetype(options?.archetypeId)) {
    const crmFiles = mergeNonprofitCrmScaffold(files, "Donor CRM");
    const crmPage = crmFiles.find((f) => f.path === "app/page.tsx");
    if (crmPage?.content?.trim()) {
      const rendered = jsxToStaticHtml(crmPage.content);
      const inner =
        rendered && !/no renderable content/i.test(rendered)
          ? rendered
          : "<p class=\"p-6 text-slate-500\">Donor CRM preview</p>";
      const crmHtml = wrapPreviewDocument(inner, options);
      if (!previewArchetypeMismatch(crmHtml, options?.archetypeId)) return crmHtml;
    }
  }

  const page =
    files.find((f) => /^app\/page\.(tsx|jsx)$/i.test(f.path.replace(/\\/g, "/"))) ||
    files.find((f) => /^app\/dashboard\/page\.(tsx|jsx)$/i.test(f.path.replace(/\\/g, "/"))) ||
    files.find((f) => /\/page\.(tsx|jsx)$/i.test(f.path)) ||
    files.find((f) => /page\.(tsx|jsx)$/i.test(f.path));
  const jsxBody = page?.content ?? "";
  const rendered = jsxToStaticHtml(jsxBody);
  const inner =
    rendered && !/no renderable content/i.test(rendered)
      ? rendered
      : "<p class=\"p-6 text-slate-500\">No renderable content.</p>";

  let html = wrapPreviewDocument(inner, options);
  if (previewArchetypeMismatch(html, options?.archetypeId) && isCrmLikeArchetype(options?.archetypeId)) {
    const crmFiles = mergeNonprofitCrmScaffold(files, "Donor CRM");
    const crmPage = crmFiles.find((f) => f.path === "app/page.tsx");
    const rendered = crmPage?.content ? jsxToStaticHtml(crmPage.content) : "";
    html = wrapPreviewDocument(
      rendered && !/no renderable content/i.test(rendered)
        ? rendered
        : "<p class=\"p-6\">Donor CRM — campaign tracking and donation history</p>",
      options,
    );
  }
  return html;
}

function jsxToStaticHtml(content: string): string {
  if (!content.trim()) return "";
  let body = content;
  const returnMatch = body.match(/return\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*}/);
  if (returnMatch) body = returnMatch[1] ?? body;
  else body = body.replace(/^[\s\S]*?return\s*/m, "").replace(/\);?\s*}$/m, "");

  return body
    .replace(/className=/g, "class=")
    .replace(/data-testid=/g, "data-testid=")
    .replace(/\{`([^`]+)`\}/g, "$1")
    .replace(/\{["']([^"']+)["']\}/g, "$1")
    .replace(/\{[^}]+\}/g, "")
    .replace(/<\/>/g, "")
    .replace(/<>/g, "")
    .slice(0, 12000);
}
