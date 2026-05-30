/** Restaurant / pantry markers that must not appear on CRM previews. */
const RESTAURANT_PREVIEW_MARKERS =
  /pantry\s*pro|restaurant\s+inventory|inventory\s+dashboard|weekly\s+spend|low\s+stock|suppliers/i;

const CRM_PREVIEW_MARKERS =
  /donor|donation|campaign|recurring\s+gift|thank-?you|nonprofit|crm/i;

export function isCrmLikeArchetype(archetypeId: string | null | undefined): boolean {
  if (!archetypeId) return false;
  const id = archetypeId.toLowerCase();
  return id === "crm" || id.includes("crm") || id.includes("nonprofit");
}

export function previewHtmlContainsRestaurantContent(html: string): boolean {
  return RESTAURANT_PREVIEW_MARKERS.test(html);
}

export function previewHtmlContainsCrmContent(html: string): boolean {
  return CRM_PREVIEW_MARKERS.test(html);
}

/** True when CRM archetype preview HTML looks like the wrong restaurant scaffold. */
export function previewArchetypeMismatch(html: string, archetypeId: string | null | undefined): boolean {
  if (!isCrmLikeArchetype(archetypeId)) return false;
  if (!previewHtmlContainsRestaurantContent(html)) return false;
  return !previewHtmlContainsCrmContent(html);
}
