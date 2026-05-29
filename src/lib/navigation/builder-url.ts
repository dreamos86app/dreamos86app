import type { BuildStrategy } from "@/lib/create/autostart-handoff";

export type BuilderUrlParams = {
  projectId: string;
  jobId?: string | null;
  conversationId?: string | null;
  autostart?: boolean;
  strategy?: BuildStrategy;
  model?: string | null;
  mode?: "discuss" | "edit" | "build";
  tab?: string;
};

export function isBuilderPathname(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.match(/^\/apps\/[^/]+\/builder\/?$/));
}

export function isCreatePathname(pathname: string | null | undefined): boolean {
  return pathname === "/create" || Boolean(pathname?.startsWith("/create/"));
}

/** Update the address bar without a Next.js navigation (keeps React state / chat). */
export function replaceBrowserUrl(path: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", path);
}

/**
 * Reflect project id in the URL after submit without leaving the builder or remounting chat.
 * Never navigates to `/create` from `/apps/.../builder`.
 */
export function syncProjectIdInAddressBar(
  projectId: string,
  pathname: string | null | undefined,
): void {
  if (isBuilderPathname(pathname)) return;
  if (!isCreatePathname(pathname)) return;
  const qs = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  if (qs.get("projectId") === projectId) return;
  qs.set("projectId", projectId);
  replaceBrowserUrl(`/create?${qs.toString()}`);
}

/** Canonical builder path — never embeds full prompt text in the query string. */
export function buildBuilderUrl(params: BuilderUrlParams): string {
  const qs = new URLSearchParams();
  if (params.autostart) qs.set("autostart", "1");
  if (params.mode && params.mode !== "build") qs.set("mode", params.mode);
  if (params.strategy) qs.set("strategy", params.strategy);
  if (params.model?.trim()) qs.set("model", params.model.trim());
  if (params.jobId) qs.set("jobId", params.jobId);
  if (params.conversationId) qs.set("conversationId", params.conversationId);
  if (params.tab) qs.set("tab", params.tab);
  const query = qs.toString();
  return `/apps/${params.projectId}/builder${query ? `?${query}` : ""}`;
}
