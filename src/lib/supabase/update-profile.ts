import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isMissingProfileColumnError,
  parseMissingProfileColumn,
} from "@/lib/supabase/schema-errors";

const OPTIONAL_PROFILE_COLUMNS = new Set([
  "onboarding_answers",
  "signup_wizard_completed",
  "use_case",
  "display_name",
  "experience_level",
  "workspace_name",
  "workspace_icon_url",
  "workspace_description",
]);

function stripOptionalColumns(
  patch: Record<string, unknown>,
  only?: Set<string>,
): Record<string, unknown> {
  const next = { ...patch };
  for (const key of Object.keys(next)) {
    if (only && !only.has(key)) continue;
    if (OPTIONAL_PROFILE_COLUMNS.has(key)) delete next[key];
  }
  return next;
}

async function tryUpdate(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<PostgrestError | null> {
  const { error } = await client.from("profiles").update(patch).eq("id", userId);
  return error;
}

/**
 * Updates profiles, dropping columns PostgREST reports as missing from the schema cache.
 * Falls back to the service role client when the user JWT update fails for other reasons.
 */
export async function updateProfileResilient(
  userClient: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ error: PostgrestError | null; droppedColumns: string[] }> {
  const dropped = new Set<string>();
  let current = { ...patch };

  const clients: SupabaseClient[] = [userClient];
  try {
    clients.push(createSupabaseAdmin());
  } catch {
    // service role not configured — user client only
  }

  for (const client of clients) {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (Object.keys(current).length === 0) {
        return { error: null, droppedColumns: [...dropped] };
      }

      const error = await tryUpdate(client, userId, current);
      if (!error) {
        return { error: null, droppedColumns: [...dropped] };
      }

      const missing = parseMissingProfileColumn(error.message);
      if (missing && missing in current) {
        dropped.add(missing);
        const { [missing]: _removed, ...rest } = current;
        current = rest;
        continue;
      }

      if (isMissingProfileColumnError(error.message)) {
        current = stripOptionalColumns(current);
        continue;
      }

      if (client === userClient && clients.length > 1) {
        break;
      }

      return { error, droppedColumns: [...dropped] };
    }
  }

  const last = await tryUpdate(userClient, userId, stripOptionalColumns(patch));
  return { error: last, droppedColumns: [...dropped] };
}
