import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { BuilderOutputContract } from "@/lib/creation/parse-builder-metadata";
import { refineAppName } from "@/lib/projects/project-context";
import { completeBuildWithValidation } from "@/lib/build/complete-build-with-validation";
import { MIN_RENDERABLE_FILES } from "@/lib/build/build-success-contract";
import { lifecyclePatch, legacyProjectStatus } from "@/lib/projects/project-lifecycle";

type Writer = SupabaseClient<Database>;

export type FinalizeBuildInput = {
  writer: Writer;
  userId: string;
  projectId: string;
  buildJobId: string | null;
  /** When true, job status was set via transition_build_job_status RPC. */
  skipJobStatusUpdate?: boolean;
  appName: string;
  appSlug: string | null;
  appDescription: string | null;
  iconSvg: string | null;
  meta: BuilderOutputContract | null;
  fileCount: number;
  creditsCharged: number;
  charged: boolean;
  errorMessage?: string | null;
};

/** Mark build + project source-of-truth after files are persisted. */
export async function finalizeBuildSuccess(input: FinalizeBuildInput): Promise<void> {
  const now = new Date().toISOString();
  const { writer, userId, projectId, buildJobId, meta, fileCount, creditsCharged, charged } = input;
  const appName = refineAppName(input.appName, meta?.app?.description ?? "");

  if (buildJobId && !input.skipJobStatusUpdate) {
    const jobPatch: Record<string, unknown> = {
      status: "completed",
      completed_at: now,
      error_message: null,
      result_summary: `Generated ${fileCount} file(s)`,
      credits_charged: charged ? creditsCharged : 0,
    };
    let { error: jobErr } = await writer
      .from("build_jobs")
      .update(jobPatch as never)
      .eq("id", buildJobId);
    if (jobErr?.message?.includes("completed_at") || jobErr?.message?.includes("credits_charged")) {
      const minimal = { status: "completed", error_message: null, result_summary: jobPatch.result_summary };
      await writer.from("build_jobs").update(minimal as never).eq("id", buildJobId);
    }
  }

  const { data: curProj } = await writer
    .from("projects")
    .select("name, slug, metadata")
    .eq("id", projectId)
    .maybeSingle();

  const prevMeta =
    curProj?.metadata && typeof curProj.metadata === "object" && !Array.isArray(curProj.metadata)
      ? (curProj.metadata as Record<string, unknown>)
      : {};

  const completion = await completeBuildWithValidation({
    writer,
    userId,
    projectId,
  });
  const lifecycle = completion.lifecycle;

  const buildMeta = {
    ...prevMeta,
    ...lifecyclePatch(lifecycle, {
      build_status:
        completion.fileCount >= MIN_RENDERABLE_FILES
          ? "completed"
          : completion.validationOk
            ? "completed"
            : "needs_repair",
    }),
    app_name: appName,
    shell_only: false,
    hide_from_list: false,
    hide_from_home: false,
    last_build_at: now,
    ...(buildJobId ? { last_build_id: buildJobId } : {}),
    builder: {
      ...(typeof prevMeta.builder === "object" && prevMeta.builder ? prevMeta.builder : {}),
      app: meta?.app ?? { name: appName },
      pages: meta?.pages ?? [],
      entities: meta?.entities ?? [],
      dashboard: meta?.dashboard ?? null,
      publish: meta?.publish ?? null,
      preview: meta?.preview ?? null,
      summary: meta?.summary ?? null,
      updated_at: now,
    },
  };

  const curName = curProj?.name?.trim() ?? "";
  const shouldRename =
    Boolean(appName) && (!curName || /^new app$/i.test(curName) || /^new build$/i.test(curName));

  const fullPatch: Record<string, unknown> = {
    name: shouldRename ? appName.slice(0, 80) : curName || appName.slice(0, 80),
    ...(input.appSlug && shouldRename ? { slug: input.appSlug.slice(0, 48) } : {}),
    ...(input.appDescription ? { description: input.appDescription.slice(0, 500) } : {}),
    app_name: appName.slice(0, 80),
    icon_svg: input.iconSvg,
    short_description: input.appDescription?.slice(0, 240) ?? null,
    category: meta?.app?.category?.slice(0, 64) ?? null,
    build_status: "completed",
    last_build_id: buildJobId,
    last_build_at: now,
    status: legacyProjectStatus(completion.lifecycle),
    metadata: buildMeta as Json,
  };

  let { error: projErr } = await writer
    .from("projects")
    .update(fullPatch as never)
    .eq("id", projectId)
    .eq("owner_id", userId);

  if (projErr) {
    const minimal: Record<string, unknown> = {
      ...(shouldRename ? { name: appName.slice(0, 80) } : {}),
      status: "draft",
      metadata: buildMeta as Json,
    };
    if (input.iconSvg) {
      try {
        minimal.app_icon_url = input.iconSvg;
      } catch {
        /* column optional */
      }
    }
    await writer.from("projects").update(minimal as never).eq("id", projectId).eq("owner_id", userId);
  }
}

export async function finalizeBuildFailed(input: {
  writer: Writer;
  buildJobId: string | null;
  errorMessage: string;
  projectId?: string;
  userId?: string;
  skipJobStatusUpdate?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  if (input.buildJobId && !input.skipJobStatusUpdate) {
    await input.writer
      .from("build_jobs")
      .update({
        status: "failed",
        error_message: input.errorMessage.slice(0, 2000),
        completed_at: now,
      } as never)
      .eq("id", input.buildJobId);
  }

  if (input.projectId && input.userId) {
    const { data: cur } = await input.writer
      .from("projects")
      .select("metadata")
      .eq("id", input.projectId)
      .maybeSingle();
    const prevMeta =
      cur?.metadata && typeof cur.metadata === "object" && !Array.isArray(cur.metadata)
        ? (cur.metadata as Record<string, unknown>)
        : {};
    await input.writer
      .from("projects")
      .update({
        build_status: "failed",
        status: "error",
        metadata: {
          ...prevMeta,
          ...lifecyclePatch("failed", { error: input.errorMessage.slice(0, 500) }),
          hide_from_list: true,
          hide_from_home: true,
          shell_only: false,
        },
      } as never)
      .eq("id", input.projectId)
      .eq("owner_id", input.userId);
  }

  try {
    await input.writer.from("preview_errors").insert({
      project_id: input.projectId,
      error_message: input.errorMessage.slice(0, 4000),
      created_at: now,
    } as never);
  } catch {
    /* table optional */
  }
}
