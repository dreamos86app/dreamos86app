import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type VerifiedProject = {
  user: User;
  projectId: string;
  ownerId: string;
};

/** Ensures the session user owns the project. */
export async function verifyProjectOwner(projectId: string): Promise<
  | { ok: true; data: VerifiedProject }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: proj } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!proj) return { ok: false, status: 404, error: "Project not found" };

  return {
    ok: true,
    data: { user, projectId: proj.id as string, ownerId: proj.owner_id as string },
  };
}

export function getIntegrationAdmin() {
  const admin = createServiceRoleClient();
  if (!admin) {
    throw new Error("Service role client unavailable");
  }
  return admin;
}
