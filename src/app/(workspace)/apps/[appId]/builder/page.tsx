import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuilderProjectGate } from "@/components/create/builder-project-gate";
import { Loader2 } from "lucide-react";

const VALID_MODES = ["discuss", "edit", "build"] as const;
type Mode = (typeof VALID_MODES)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ appId: string }>;
}): Promise<Metadata> {
  const { appId } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("name, app_name")
    .eq("id", appId)
    .maybeSingle();
  const name =
    (typeof project?.app_name === "string" && project.app_name.trim()) ||
    project?.name ||
    "App builder";
  return {
    title: name,
    description: "Build and iterate on your app with AI.",
  };
}

export default async function AppBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{
    prompt?: string;
    mode?: string;
    autostart?: string;
    strategy?: string;
    model?: string;
    jobId?: string;
    conversationId?: string;
  }>;
}) {
  const { appId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const sp = await searchParams;
  const initialMode: Mode = VALID_MODES.includes(sp.mode as Mode) ? (sp.mode as Mode) : "build";
  const initialAutoStart = sp.autostart === "1" || sp.autostart === "true";
  const initialBuildStrategy = sp.strategy === "build_now" ? "build_now" : "plan_first";

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, name, preview_url, icon_url, gradient, status, framework, custom_domain, is_public, metadata, published_subdomain, app_name, build_status, short_description, category, icon_svg",
    )
    .eq("id", appId)
    .eq("owner_id", user.id)
    .maybeSingle();

  const row = project
    ? {
        ...project,
        name:
          (typeof project.app_name === "string" && project.app_name.trim()) || project.name,
      }
    : null;

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Loader2 className="size-5 animate-spin text-muted-foreground/40" strokeWidth={1.75} />
        </div>
      }
    >
      <BuilderProjectGate
        appId={appId}
        userId={user.id}
        initialProject={row}
        initialPrompt={sp.prompt ?? ""}
        initialMode={initialMode}
        initialAutoStart={initialAutoStart}
        initialBuildStrategy={initialBuildStrategy}
        initialModelId={sp.model ?? undefined}
        initialJobId={sp.jobId ?? null}
        initialConversationId={sp.conversationId ?? null}
        loadError={error?.message ?? null}
      />
    </Suspense>
  );
}
