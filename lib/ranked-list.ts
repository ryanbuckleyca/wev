/**
 * Pure helpers for managing a ranked/unranked split within an ordered list.
 *
 * Items 0..cutoff-1 are "ranked" (prioritised).
 * Items cutoff..end are unranked.
 */

/** Returns the new cutoff after removing an item at `idx`. */
export function adjustCutoffOnRemove(idx: number, cutoff: number): number {
  return idx < cutoff ? cutoff - 1 : cutoff
}

/** Returns the new cutoff after a reorder, given an explicit override or movement direction. */
export function adjustCutoffOnReorder(
  from: number,
  to: number,
  cutoff: number,
  explicitCutoff?: number
): number {
  if (explicitCutoff !== undefined) return explicitCutoff
  if (from >= cutoff && to < cutoff) return cutoff + 1
  if (from < cutoff && to >= cutoff) return cutoff - 1
  return cutoff
}
