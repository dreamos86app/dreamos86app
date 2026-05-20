export async function testSupabaseAnon(url: string, anonKey: string): Promise<{ ok: boolean; error?: string }> {
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `Anon key rejected (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Supabase REST" };
  }
}

export async function testSupabaseServiceRole(
  url: string,
  serviceKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok && res.status !== 404) {
      return { ok: false, error: `Service role key failed (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Supabase with service key" };
  }
}

export function extractSupabaseRef(url: string): string | null {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
