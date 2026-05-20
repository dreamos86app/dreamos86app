import { NextResponse } from "next/server";
import { verifyProjectOwner } from "@/lib/integrations/server/verify-project";
import {
  saveProjectSecret,
  upsertProjectIntegration,
  writeConnectionAudit,
} from "@/lib/integrations/server/integration-store";
import {
  extractSupabaseRef,
  testSupabaseAnon,
  testSupabaseServiceRole,
} from "@/lib/integrations/server/supabase-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const verified = await verifyProjectOwner(projectId);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  let body: { url?: string; anonKey?: string; serviceRoleKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const anonKey = typeof body.anonKey === "string" ? body.anonKey.trim() : "";
  const serviceRoleKey =
    typeof body.serviceRoleKey === "string" ? body.serviceRoleKey.trim() : "";

  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase URL and anon key are required" }, { status: 400 });
  }

  try {
    new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return NextResponse.json({ error: "Invalid Supabase URL" }, { status: 400 });
  }

  const anonTest = await testSupabaseAnon(url, anonKey);
  if (!anonTest.ok) {
    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "supabase",
      action: "connect",
      status: "error",
      message: anonTest.error,
    });
    return NextResponse.json({ error: anonTest.error ?? "Anon key test failed" }, { status: 400 });
  }

  if (serviceRoleKey) {
    const svcTest = await testSupabaseServiceRole(url, serviceRoleKey);
    if (!svcTest.ok) {
      return NextResponse.json({ error: svcTest.error ?? "Service role key test failed" }, { status: 400 });
    }
  }

  const ref = extractSupabaseRef(url);
  const now = new Date().toISOString();

  try {
    await saveProjectSecret({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "supabase",
      keyName: "SUPABASE_URL",
      value: url.replace(/\/$/, ""),
    });
    await saveProjectSecret({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "supabase",
      keyName: "SUPABASE_ANON_KEY",
      value: anonKey,
    });
    if (serviceRoleKey) {
      await saveProjectSecret({
        projectId,
        ownerId: verified.data.ownerId,
        provider: "supabase",
        keyName: "SUPABASE_SERVICE_ROLE_KEY",
        value: serviceRoleKey,
      });
    }

    await upsertProjectIntegration({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "supabase",
      status: "connected",
      displayName: ref ? `Supabase (${ref})` : "Supabase",
      metadata: {
        projectRef: ref,
        hasServiceRole: Boolean(serviceRoleKey),
      },
      lastTestedAt: now,
    });

    await writeConnectionAudit({
      projectId,
      ownerId: verified.data.ownerId,
      provider: "supabase",
      action: "connect",
      status: "ok",
      message: "Supabase connected for this app",
    });

    return NextResponse.json({
      ok: true,
      displayName: ref ? `Supabase (${ref})` : "Supabase",
      lastTestedAt: now,
      hasServiceRole: Boolean(serviceRoleKey),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save connection";
    const hint = msg.includes("DREAMOS_SECRETS_MASTER_KEY")
      ? "Set DREAMOS_SECRETS_MASTER_KEY (64 hex chars) on the server."
      : undefined;
    return NextResponse.json({ error: msg, hint }, { status: 503 });
  }
}
