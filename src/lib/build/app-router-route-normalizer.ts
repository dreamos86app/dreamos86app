/**
 * Next.js App Router path repair — converts flat route files to folder/page.tsx layout.
 */
import type { BuildFile } from "@/lib/build/generated-file-utils";
import { normalizeBuildFilePath } from "@/lib/build/generated-file-utils";

const APP_ROUTE_TSX_RE = /^app\/([a-z0-9][a-z0-9-]*)\.(tsx|jsx|ts|js)$/i;
const SKIP_SEGMENTS = new Set(["layout", "page", "loading", "error", "not-found", "global-error", "route"]);

function slugFromBlueprintRoute(route: string): string {
  return route.replace(/^\//, "").trim().toLowerCase();
}

function defaultPackageJson(appName: string): string {
  const name = appName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "dream-app";
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      scripts: { dev: "next dev", build: "next build", start: "next start" },
      dependencies: {
        next: "^15.0.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
        "@types/node": "^20.0.0",
        "@types/react": "^19.0.0",
        tailwindcss: "^3.4.0",
        postcss: "^8.4.0",
        autoprefixer: "^10.4.0",
      },
    },
    null,
    2,
  );
}

function defaultGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;
body { font-feature-settings: "ss01"; }
`;
}

/** Move app/foo.tsx → app/foo/page.tsx; ensure package.json, layout, globals, root page. */
export function normalizeAppRouterBuildFiles(
  files: BuildFile[],
  options?: { blueprintRoutes?: string[] | null; appName?: string },
): { files: BuildFile[]; moved: string[]; addedPackageJson: boolean } {
  const byPath = new Map<string, BuildFile>();
  const moved: string[] = [];
  let addedPackageJson = false;

  for (const f of files) {
    const path = normalizeBuildFilePath(f.path);
    if (!path || !f.content?.trim()) continue;

    const m = path.match(APP_ROUTE_TSX_RE);
    if (m && !SKIP_SEGMENTS.has(m[1]!.toLowerCase())) {
      const slug = m[1]!;
      const ext = m[2]!.toLowerCase() === "ts" ? "tsx" : m[2]!.toLowerCase();
      const target = `app/${slug}/page.${ext}`;
      if (!byPath.has(target)) {
        moved.push(`${path}→${target}`);
        byPath.set(target, { path: target, content: f.content, language: f.language });
        continue;
      }
    }
    byPath.set(path, { ...f, path });
  }

  const routes = (options?.blueprintRoutes ?? [])
    .map(slugFromBlueprintRoute)
    .filter(Boolean);

  for (const slug of routes) {
    if (slug === "dashboard" || slug === "home") continue;
    const pagePath = `app/${slug}/page.tsx`;
    const flatTsx = `app/${slug}.tsx`;
    if (!byPath.has(pagePath) && byPath.has(flatTsx)) {
      const src = byPath.get(flatTsx)!;
      byPath.delete(flatTsx);
      byPath.set(pagePath, { path: pagePath, content: src.content });
      moved.push(`${flatTsx}→${pagePath}`);
    }
  }

  if (!byPath.has("package.json")) {
    addedPackageJson = true;
    byPath.set("package.json", {
      path: "package.json",
      content: defaultPackageJson(options?.appName ?? "Dream App"),
    });
  }

  if (!byPath.has("app/globals.css")) {
    byPath.set("app/globals.css", { path: "app/globals.css", content: defaultGlobalsCss() });
  }

  if (!byPath.has("app/layout.tsx") && !byPath.has("app/layout.jsx")) {
    byPath.set("app/layout.tsx", {
      path: "app/layout.tsx",
      content: `import "./globals.css";

export const metadata = { title: "${(options?.appName ?? "Dream App").replace(/"/g, '\\"')}" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
`,
    });
  }

  if (!byPath.has("app/page.tsx")) {
    const dash = byPath.get("app/dashboard/page.tsx");
    if (dash) {
      byPath.set("app/page.tsx", {
        path: "app/page.tsx",
        content: `import { redirect } from "next/navigation";
export default function Home() { redirect("/dashboard"); }
`,
      });
    }
  }

  return { files: [...byPath.values()], moved, addedPackageJson };
}
