import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireServerUser } from "@/lib/auth/session";
import { ImmersiveWorkspace } from "@/components/create/workspace/immersive-workspace";
import { Loader2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Create",
  description: "DreamOS86 create workspace — build with AI.",
};

const VALID_MODES = ["discuss", "edit", "build"] as const;
type Mode = (typeof VALID_MODES)[number];

export default async function WorkspaceCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; projectId?: string; mode?: string; autostart?: string }>;
}) {
  const { prompt, projectId, mode, autostart } = await searchParams;
  const nextPath = `/create${prompt || projectId || mode ? `?${new URLSearchParams({ ...(prompt ? { prompt } : {}), ...(projectId ? { projectId } : {}), ...(mode ? { mode } : {}) }).toString()}` : ""}`;
  const user = await requireServerUser(nextPath);

  const supabase = await createClient();

  // Validate mode param — fall back to "build" for unknown values
  const initialMode: Mode = VALID_MODES.includes(mode as Mode)
    ? (mode as Mode)
    : "build";

  // If a projectId is provided, fetch the project
  let project = null;
  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, preview_url, icon_url, gradient, status, framework, custom_domain, is_public, metadata, published_subdomain")
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .single();
    project = data;
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Loader2 className="size-5 animate-spin text-muted-foreground/40" strokeWidth={1.75} />
        </div>
      }
    >
      <ImmersiveWorkspace
        initialPrompt={prompt ?? ""}
        initialMode={initialMode}
        initialAutoStart={autostart === "1"}
        project={project}
      />
    </Suspense>
  );
}
