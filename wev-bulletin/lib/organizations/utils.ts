/**
 * Shared utilities for organization display logic.
 */

/**
 * Maps a raw org type string to a translated display label.
 * Returns the raw value unchanged for unrecognised types, null for empty.
 *
 * The `t` function must resolve keys relative to the `organizations` namespace:
 *   t('nonprofit')  →  "Nonprofit"
 *   t('other')      →  "Other"
 */
export function getOrganizationTypeLabel(
  type: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!type) return null;
  const normalized = type.toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'nonprofit') return t('nonprofit');
  if (normalized === 'other') return t('other');
  return type;
}
