import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sealIntegrationSecret } from "@/lib/secrets/seal";

export const dynamic = "force-dynamic";

/**
 * List configured secret key names for a project (never returns values).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createServiceRoleClient() ?? supabase;
  const { data: rows, error } = await admin
    .from("project_secrets")
    .select("key_name, updated_at")
    .eq("project_id", projectId)
    .order("key_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    keys: (rows ?? []).map((r) => ({
      name: r.key_name as string,
      updated_at: r.updated_at as string,
    })),
  });
}

/**
 * Save or rotate one secret (server encrypts; raw value never stored plaintext).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const supabase = await createClient();
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server misconfiguration: service role client unavailable." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { keyName?: string; value?: string };
  try {
    body = (await req.json()) as { keyName?: string; value?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const keyName = typeof body.keyName === "string" ? body.keyName.trim() : "";
  const value = typeof body.value === "string" ? body.value : "";
  if (!keyName || !/^[A-Z][A-Z0-9_]{2,64}$/.test(keyName)) {
    return NextResponse.json({ error: "Invalid keyName" }, { status: 400 });
  }
  if (!value.trim()) {
    return NextResponse.json({ error: "value required" }, { status: 400 });
  }

  let sealed: string;
  try {
    sealed = sealIntegrationSecret(value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Encryption unavailable";
    return NextResponse.json(
      {
        error: msg,
        hint:
          "Set DREAMOS_SECRETS_MASTER_KEY in the server environment (64 hex chars = 32-byte AES key), then restart.",
      },
      { status: 503 },
    );
  }

  const { error } = await admin.from("project_secrets").upsert(
    {
      project_id: projectId,
      owner_id: user.id,
      key_name: keyName,
      ciphertext: sealed,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "project_id,key_name" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, keyName });
}
