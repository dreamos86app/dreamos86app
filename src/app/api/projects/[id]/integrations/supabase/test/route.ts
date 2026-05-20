import { NextResponse } from "next/server";
import { verifyProjectOwner, getIntegrationAdmin } from "@/lib/integrations/server/verify-project";
import {
  upsertProjectIntegration,
  writeConnectionAudit,
} from "@/lib/integrations/server/integration-store";
import { testSupabaseAnon, testSupabaseServiceRole } from "@/lib/integrations/server/supabase-api";
import { unsealSecret } from "@/lib/secrets/seal";

export const dynamic = "force-dynamic";

async function readSecret(
  admin: ReturnType<typeof getIntegrationAdmin>,
  projectId: string,
  keyName: string,
): Promise<string | null> {
  const { data } = await admin
    .from("project_secrets")
    .select("ciphertext")
    .eq("project_id", projectId)
    .eq("key_name", keyName)
    .maybeSingle();
  if (!data?.ciphertext) return null;
  return unsealSecret(data.ciphertext as string);
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  let admin;
  try {
    admin = getIntegrationAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server misconfiguration" },
      { status: 503 },
    );
  }

  let url: string | null;
  let anon: string | null;
  let service: string | null;
  try {
    url = await readSecret(admin, projectId, "SUPABASE_URL");
    anon = await readSecret(admin, projectId, "SUPABASE_ANON_KEY");
    service = await readSecret(admin, projectId, "SUPABASE_SERVICE_ROLE_KEY");
  } catch {
    return NextResponse.json(
      { error: "Could not read stored keys", hint: "Check DREAMOS_SECRETS_MASTER_KEY." },
      { status: 503 },
    );
  }

  if (!url || !anon) {
    return NextResponse.json({ error: "Supabase is not connected for this app" }, { status: 400 });
  }

  const anonTest = await testSupabaseAnon(url, anon);
  if (!anonTest.ok) {
    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "supabase",
      action: "test",
      status: "error",
      message: anonTest.error,
    });
    return NextResponse.json({ error: anonTest.error }, { status: 400 });
  }

  if (service) {
    const svcTest = await testSupabaseServiceRole(url, service);
    if (!svcTest.ok) {
      return NextResponse.json({ error: svcTest.error }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  await upsertProjectIntegration({
    projectId,
    ownerId: verified.data.ownerId,
    provider: "supabase",
    status: "connected",
    displayName: "Supabase",
    metadata: { hasServiceRole: Boolean(service) },
    lastTestedAt: now,
  });
  await writeConnectionAudit({
    projectId,
    ownerId: verified.data.ownerId,
    provider: "supabase",
    action: "test",
    status: "ok",
  });

  return NextResponse.json({ ok: true, lastTestedAt: now });
}
