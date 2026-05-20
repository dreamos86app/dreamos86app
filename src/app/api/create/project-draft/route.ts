import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { bootstrapProfileFromOAuth } from "@/lib/auth/profile-bootstrap";

function slugFromTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "app";
}

/**
 * POST — create a draft project for the signed-in user (build mode bootstrap).
 * Uses service role when available so RLS/schema drift does not block creation.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name = "New app";
  try {
    const body = (await request.json()) as { name?: string };
    if (typeof body.name === "string" && body.name.trim()) {
      name = body.name.trim().slice(0, 80);
    }
  } catch {
    /* optional body */
  }

  try {
    await bootstrapProfileFromOAuth(user, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "profile_bootstrap_failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const admin = createServiceRoleClient();
  const writer = admin ?? supabase;
  const slug = `${slugFromTitle(name)}-${Date.now().toString(36)}`;

  const { data, error } = await writer
    .from("projects")
    .insert({
      owner_id: user.id,
      name,
      slug,
      status: "building",
      framework: "nextjs",
    } as never)
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      {
        error: "Could not create app project",
        hint: error?.message ?? "Check Supabase migrations and projects table RLS.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ projectId: data.id });
}
