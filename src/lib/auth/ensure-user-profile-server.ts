import { createSupabaseAdmin } from "@/lib/supabase/admin";

/** Ensures profile row + defaults via service-role RPC (never resets credits). */
export async function ensureUserProfileServer(
  userId: string,
  email?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.rpc(
      "ensure_user_profile" as "charge_tokens",
      {
        p_user_id: userId,
        p_email: email ?? null,
      } as never,
    );
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
