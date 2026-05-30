import { rejectBannedRefs } from "@/lib/ai/file-fingerprint";
import { UI_QUALITY_BANNED } from "@/lib/generation/ui-quality-spec";

export type GeneratedAppValidation = {
  ok: boolean;
  reasons: string[];
  placeholderDetected: boolean;
};

const PLACEHOLDER_PATTERNS = [
  /waiting for app to be generated/i,
  /coming soon/i,
  /todo:\s*build/i,
  /todo:\s*implement/i,
  /\bTODO\b/i,
  /lorem ipsum/i,
  /your app will appear here/i,
  /under construction/i,
  /not implemented yet/i,
  /page under development/i,
];

const UNSTYLED_HTML =
  /<(?:div|main|section|button|p)(?![^>]*className)[^>]*>[\s\S]{20,}/i;

const FAKE_BUTTON =
  /<button[^>]*disabled[^>]*>(?:Get started|Sign up|Submit|Buy now|Checkout|Book now)/i;

export function validateGeneratedApp(input: {
  files: Array<{ path: string; content: string }>;
  projectId?: string | null;
  ownerId?: string | null;
  routeMap?: string[] | null;
}): GeneratedAppValidation {
  const reasons: string[] = [];
  if (!input.projectId) reasons.push("missing_project_id");
  if (!input.ownerId) reasons.push("missing_owner_id");
  if (input.files.length === 0) reasons.push("no_files");

  const hasPage =
    input.files.some((f) => /page\.(tsx|jsx|js)$/i.test(f.path)) ||
    input.files.some((f) => /\/page\.(tsx|jsx)/i.test(f.path)) ||
    input.files.some((f) => /index\.html$/i.test(f.path));
  if (!hasPage) reasons.push("no_page_route");

  const hasPackage = input.files.some(
    (f) => f.path === "package.json" || f.path.endsWith("/package.json"),
  );
  if (!hasPackage) reasons.push("missing_package_json");

  let placeholderDetected = false;
  const uiFiles = input.files.filter((f) => /\.(tsx|jsx|html)$/i.test(f.path));
  const combined = uiFiles.map((f) => f.content).join("\n") || input.files.map((f) => f.content).join("\n");

  for (const p of [...PLACEHOLDER_PATTERNS, ...UI_QUALITY_BANNED]) {
    if (p.test(combined)) {
      placeholderDetected = true;
      reasons.push(`placeholder_content:${p.source}`);
    }
  }

  const banned = rejectBannedRefs(combined);
  if (banned) reasons.push(banned);

  if (/service_role|SUPABASE_SERVICE/i.test(combined)) {
    reasons.push("secrets_in_generated_files");
  }

  const onlyTodos =
    input.files.length > 0 &&
    input.files.every(
      (f) => /^(TODO|FIXME|\/\/ todo)/im.test(f.content.trim()) || f.content.trim().length < 40,
    );
  if (onlyTodos) {
    placeholderDetected = true;
    reasons.push("todo_only_content");
  }

  const todoPage = uiFiles.some(
    (f) =>
      /page\.(tsx|jsx)$/i.test(f.path) &&
      (/coming soon|TODO|FIXME|placeholder only/i.test(f.content) || f.content.trim().length < 120),
  );
  if (todoPage) {
    placeholderDetected = true;
    reasons.push("todo_or_stub_page");
  }

  if (UNSTYLED_HTML.test(combined) && !/className=/.test(combined)) {
    reasons.push("unstyled_html");
  }

  if (FAKE_BUTTON.test(combined) && !/onClick|href=/i.test(combined)) {
    placeholderDetected = true;
    reasons.push("fake_disabled_primary_button");
  }

  if (input.routeMap?.length) {
    const pathList = input.files.map((f) => f.path.replace(/\\/g, "/"));
    const paths = pathList.join("\n");
    const pathsLower = paths.toLowerCase();
    const missing = input.routeMap.filter((r) => {
      const norm = r.replace(/^\//, "").toLowerCase();
      if (norm === "dashboard" || norm === "home") {
        const hasDashboard =
          pathList.some((p) => /(^|\/)app\/page\.(tsx|jsx|js)$/i.test(p)) ||
          pathsLower.includes("dashboard");
        return !hasDashboard;
      }
      const hasPageFile =
        pathList.some((p) => new RegExp(`(^|/)app/${norm.replace(/\//g, "/")}/page\\.(tsx|jsx|js)$`, "i").test(p)) ||
        pathList.some((p) => new RegExp(`(^|/)app/${norm}\\.(tsx|jsx|js)$`, "i").test(p));
      return !hasPageFile && !pathsLower.includes(`app/${norm}/`);
    });
    if (missing.length) reasons.push(`missing_blueprint_routes:${missing.slice(0, 5).join(",")}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    placeholderDetected,
  };
}
