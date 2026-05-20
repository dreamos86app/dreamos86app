import { sealIntegrationSecret } from "@/lib/secrets/seal";
import { maskSecretValue } from "@/lib/integrations/mask-secret";
import { getIntegrationAdmin } from "@/lib/integrations/server/verify-project";

export type IntegrationProvider =
  | "github"
  | "supabase"
  | "stripe"
  | "vercel"
  | "resend"
  | "openai"
  | "gemini"
  | "r2"
  | "slack";

export type IntegrationStatus = "disconnected" | "needs_config" | "connected" | "error";

export async function writeConnectionAudit(opts: {
  projectId: string;
  ownerId: string;
  provider: string;
  action: string;
  status: string;
  message?: string;
}) {
  const admin = getIntegrationAdmin();
  await admin.from("project_connection_audit").insert({
    project_id: opts.projectId,
    owner_id: opts.ownerId,
    provider: opts.provider,
    action: opts.action,
    status: opts.status,
    message: opts.message ?? null,
  } as never);
}

export async function upsertProjectIntegration(opts: {
  projectId: string;
  ownerId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
  lastTestedAt?: string | null;
}) {
  const admin = getIntegrationAdmin();
  const row = {
    project_id: opts.projectId,
    owner_id: opts.ownerId,
    provider: opts.provider,
    status: opts.status,
    display_name: opts.displayName ?? null,
    metadata: opts.metadata ?? {},
    last_tested_at: opts.lastTestedAt ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("project_integrations").upsert(row as never, {
    onConflict: "project_id,provider",
  });
  if (error) throw new Error(error.message);
}

export async function saveProjectSecret(opts: {
  projectId: string;
  ownerId: string;
  provider: IntegrationProvider;
  keyName: string;
  value: string;
}) {
  const admin = getIntegrationAdmin();
  const sealed = sealIntegrationSecret(opts.value);
  const masked = maskSecretValue(opts.value);
  const { error } = await admin.from("project_secrets").upsert(
    {
      project_id: opts.projectId,
      owner_id: opts.ownerId,
      provider: opts.provider,
      key_name: opts.keyName,
      ciphertext: sealed,
      masked_value: masked,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "project_id,key_name" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteProviderSecrets(opts: {
  projectId: string;
  provider: IntegrationProvider;
}) {
  const admin = getIntegrationAdmin();
  await admin
    .from("project_secrets")
    .delete()
    .eq("project_id", opts.projectId)
    .eq("provider", opts.provider);
}

export async function listProjectIntegrations(projectId: string) {
  const admin = getIntegrationAdmin();
  const { data, error } = await admin
    .from("project_integrations")
    .select("provider, status, display_name, metadata, last_tested_at, updated_at")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data ?? [];
}
