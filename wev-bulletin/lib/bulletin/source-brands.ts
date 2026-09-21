/**
 * Job boards that scrape as multiple `sources` rows (paid vs volunteer) but
 * should appear as one board in the Jobs "Source" filter.
 *
 * URL/API `srcs` values are brand labels. Query expansion maps them to the
 * denormalized `jobs.source` strings stored from each board's display name.
 */

export const SOURCE_BRANDS = [
  {
    brand: 'WorkInNonProfits',
    match: /work\s*in\s*non\s*profits/i,
    /** Canonical `sources.name` / `jobs.source` values for this board. */
    aliases: [
      'WorkInNonProfits Jobs',
      'WorkInNonProfits Volunteer',
      'Work In NonProfits Jobs',
      'Work In NonProfits Volunteer',
    ],
  },
  {
    brand: 'Ma Communauté',
    match: /ma\s*communaut[eé]/i,
    aliases: [
      'Ma Communauté Emplois',
      'Ma Communauté Bénévolat',
      'Ma Communauté (emplois)',
      'Ma Communauté (bénévolat)',
    ],
  },
  {
    brand: 'Idealist',
    match: /idealist/i,
    aliases: ['Idealist', 'Idealist Jobs', 'Idealist Internships'],
  },
] as const;

export type SourceBrand = (typeof SOURCE_BRANDS)[number]['brand'];

/** Collapse a stored source display name to its filter brand, if any. */
export function toSourceBrand(sourceName: string | null | undefined): string | null {
  const raw = (sourceName || '').trim();
  if (!raw) return null;
  for (const { brand, match } of SOURCE_BRANDS) {
    if (match.test(raw)) return brand;
  }
  return raw;
}

/**
 * Expand selected filter values (brands and/or legacy raw names) into every
 * concrete `jobs.source` string that should match a PostgREST `.in('source', …)`.
 *
 * `knownSources` adds any extra raw names seen in facet data (covers renamed
 * variants beyond the seeded aliases).
 */
export function expandSourceFilterSelection(
  selected: string[],
  knownSources: readonly string[] = [],
): string[] {
  if (selected.length === 0) return [];

  const pool = new Set<string>([...knownSources, ...selected]);
  for (const { aliases } of SOURCE_BRANDS) {
    for (const alias of aliases) pool.add(alias);
  }

  const expanded = new Set<string>();

  for (const value of selected) {
    const brand = toSourceBrand(value) ?? value;
    let matched = false;
    for (const raw of pool) {
      if ((toSourceBrand(raw) ?? raw) === brand) {
        expanded.add(raw);
        matched = true;
      }
    }
    // Brand selected but no known raw rows yet — keep the brand token so an
    // empty `.in()` does not accidentally match everything.
    if (!matched) expanded.add(value);
  }

  // Drop brand-only tokens when we also have concrete aliases (PostgREST
  // equality would never match the brand label on `jobs.source`).
  for (const { brand, aliases } of SOURCE_BRANDS) {
    if (expanded.has(brand) && aliases.some((a) => expanded.has(a))) {
      expanded.delete(brand);
    }
  }

  return Array.from(expanded);
}

/** Whether a job's stored source matches the selected Source filter values. */
export function matchesSourceSelection(
  jobSource: string | null | undefined,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  if (jobSource == null || jobSource === '') return false;
  const jobBrand = toSourceBrand(jobSource) ?? jobSource;
  return selected.some((value) => (toSourceBrand(value) ?? value) === jobBrand);
}

/** Unique brand labels for the Source filter checkbox list. */
export function brandSourceOptions(rawSources: readonly string[]): string[] {
  const brands = new Set<string>();
  for (const raw of rawSources) {
    const brand = toSourceBrand(raw);
    if (brand) brands.add(brand);
  }
  return Array.from(brands).sort((a, b) => a.localeCompare(b));
}

/** Normalize URL/API selections to brand labels (deduped, stable order). */
export function canonicalizeSourceSelection(selected: readonly string[]): string[] {
  return brandSourceOptions(selected);
}
