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
