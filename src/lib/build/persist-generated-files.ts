import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  mayClearGeneratedFiles,
  type ClearGeneratedFilesContext,
} from "@/lib/build/clear-generated-files-policy";
import {
  filterRenderableBuildFiles,
  isHiddenGeneratedPath,
  type BuildFile,
} from "@/lib/build/generated-file-utils";
import { normalizeAppRouterBuildFiles } from "@/lib/build/app-router-route-normalizer";
import { MIN_RENDERABLE_FILES } from "@/lib/build/build-success-contract";

type Writer = SupabaseClient<Database>;

function persistenceWriter(writer: Writer): Writer {
  return (createServiceRoleClient() ?? writer) as Writer;
}

export type PersistBuildFilesResult = {
  ok: boolean;
  savedCount: number;
  renderableCount: number;
  error?: string;
};

/** Upsert only real source files; never metadata snippets. */
export async function persistGeneratedBuildFiles(input: {
  writer: Writer;
  projectId: string;
  ownerId: string;
  files: BuildFile[];
  source?: string;
  operationId?: string;
  executionInstanceId?: string;
}): Promise<PersistBuildFilesResult> {
  const writer = persistenceWriter(input.writer);
  const normalized = normalizeAppRouterBuildFiles(input.files, { appName: "Dream App" });
  const renderable = filterRenderableBuildFiles(normalized.files);
  if (renderable.length === 0) {
    return { ok: false, savedCount: 0, renderableCount: 0, error: "no_renderable_files" };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[persist-generated-files] before upsert", {
      projectId: input.projectId,
      ownerId: input.ownerId,
      operationId: input.operationId,
      executionInstanceId: input.executionInstanceId,
      renderableCount: renderable.length,
      samplePaths: renderable.slice(0, 10).map((f) => f.path),
    });
  }

  const rows = renderable.map((f) => ({
    project_id: input.projectId,
    owner_id: input.ownerId,
    path: f.path,
    content: f.content,
    language: f.language ?? f.path.split(".").pop() ?? "text",
    mime_type: f.path.endsWith(".json") ? "application/json" : "text/plain",
    size_bytes: Buffer.byteLength(f.content, "utf8"),
    source: input.source ?? "generated",
    metadata: {
      kind: "source",
      operation_id: input.operationId ?? null,
      execution_instance_id: input.executionInstanceId ?? null,
    } as never,
  }));

  const { error: afErr } = await writer.from("app_files").upsert(rows as never, {
    onConflict: "project_id,path",
  });

  if (afErr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[persist-generated-files] upsert failed:", afErr.message);
    }
    return {
      ok: false,
      savedCount: 0,
      renderableCount: renderable.length,
      error: afErr.message,
    };
  }

  const { count } = await writer
    .from("app_files")
    .select("path", { count: "exact", head: true })
    .eq("project_id", input.projectId);

  const { data: paths } = await writer
    .from("app_files")
    .select("path")
    .eq("project_id", input.projectId)
    .limit(200);

  const visibleCount =
    paths?.filter((p) => p.path && !isHiddenGeneratedPath(p.path)).length ?? count ?? renderable.length;

  if (process.env.NODE_ENV !== "production") {
    console.info("[persist-generated-files] after upsert", {
      projectId: input.projectId,
      visibleCount,
      renderableCount: renderable.length,
    });
  }

  return {
    ok: visibleCount >= MIN_RENDERABLE_FILES,
    savedCount: visibleCount,
    renderableCount: renderable.length,
  };
}

/** Remove generated source files when a build fails — only the claiming worker may clear. */
export async function clearGeneratedBuildFiles(input: {
  writer: Writer;
  projectId: string;
  ownerId: string;
  buildJobId?: string;
  executionInstanceId?: string;
  /** Why the clear is requested — blocks clear after persist + preview failure. */
  context?: ClearGeneratedFilesContext;
}): Promise<{ cleared: boolean; reason?: string }> {
  if (input.context && !mayClearGeneratedFiles(input.context)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[persist-generated-files] clear blocked — policy", {
        context: input.context,
        projectId: input.projectId,
      });
    }
    return { cleared: false, reason: `policy_blocked:${input.context}` };
  }

  const writer = persistenceWriter(input.writer);

  if (input.buildJobId && input.executionInstanceId) {
    const { data: job } = await writer
      .from("build_jobs")
      .select("execution_instance_id, status")
      .eq("id", input.buildJobId)
      .maybeSingle();
    const owner = job?.execution_instance_id ?? null;
    if (owner && owner !== input.executionInstanceId) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[persist-generated-files] clear blocked — stale worker", {
          buildJobId: input.buildJobId,
          owner,
          attempted: input.executionInstanceId,
        });
      }
      return { cleared: false, reason: "stale_worker" };
    }

    if (job?.status === "completed") {
      return { cleared: false, reason: "job_already_completed" };
    }
  }

  await writer
    .from("app_files")
    .delete()
    .eq("project_id", input.projectId)
    .eq("owner_id", input.ownerId)
    .eq("source", "generated");

  return { cleared: true };
}
