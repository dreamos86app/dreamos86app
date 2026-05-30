import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  isBuildJobEventsTableMissing,
  isBuildEventsSchemaError,
  logBuildEventsSetupWarningOnce,
  markBuildJobEventsTableMissing,
} from "@/lib/build/build-events-schema-health";

let lastProbeAt = 0;
const PROBE_COOLDOWN_MS = 60_000;

/**
 * Lightweight reachability check for build_job_events (service role).
 * Marks global health flag used by status routes and persist warnings.
 */
export async function probeBuildJobEventsTable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastProbeAt < PROBE_COOLDOWN_MS && !isBuildJobEventsTableMissing()) {
    return true;
  }
  lastProbeAt = now;

  const admin = createServiceRoleClient();
  if (!admin) {
    markBuildJobEventsTableMissing(true);
    logBuildEventsSetupWarningOnce();
    return false;
  }

  const { error } = await admin.from("build_job_events").select("id").limit(1);
  if (error) {
    const msg = error.message ?? "";
    if (isBuildEventsSchemaError(msg)) {
      markBuildJobEventsTableMissing(true);
      logBuildEventsSetupWarningOnce();
      return false;
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[build-events] probe failed:", msg);
    }
    return false;
  }

  markBuildJobEventsTableMissing(false);
  return true;
}
