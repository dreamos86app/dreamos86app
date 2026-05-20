/** PostgREST / cache errors where the table exists but API metadata is stale. */
export function isPostgrestSchemaOrMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    m.includes("pgrst204") ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}

/** e.g. Could not find the 'onboarding_answers' column of 'profiles' in the schema cache */
export function parseMissingProfileColumn(message: string): string | null {
  const match = message.match(/could not find the '([^']+)' column of 'profiles'/i);
  return match?.[1] ?? null;
}

export function isMissingProfileColumnError(message: string): boolean {
  return parseMissingProfileColumn(message) !== null;
}

/** Optional billing/profile columns missing from PostgREST — must not block Create. */
export function isOptionalProfileSchemaError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isPostgrestSchemaOrMissingTableError(message) ||
    isMissingProfileColumnError(message) ||
    m.includes("pgrst204") ||
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("column") && m.includes("profiles"))
  );
}
