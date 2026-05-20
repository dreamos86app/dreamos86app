/** Last 4 chars visible for UI display — never log full value. */
export function maskSecretValue(value: string): string {
  const v = value.trim();
  if (!v) return "••••";
  if (v.length <= 8) return "••••••••";
  return `••••${v.slice(-4)}`;
}
