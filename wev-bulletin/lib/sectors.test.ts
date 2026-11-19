import { describe, expect, it } from 'vitest';
import {
  buildSourceCategoriesPayload,
  CROSSWALK_SOURCE_IDS,
  getSectorEntry,
  isValidSector,
  normalizeCrosswalkTerm,
  parseCrosswalkCell,
  resolveCrosswalkMatches,
  resolveSectorFromCrosswalk,
  SECTORS_LIST,
  SECTOR_TAXONOMY_VERSION,
} from './sectors';

describe('sector taxonomy document', () => {
  it('exposes eleven sector ids and a version', () => {
    expect(SECTORS_LIST).toHaveLength(11);
    expect(SECTOR_TAXONOMY_VERSION).toBeTruthy();
    expect(isValidSector('agriculture-food-systems')).toBe(true);
    expect(isValidSector('not-real')).toBe(false);
  });

  it('restores definitions and labels on each sector', () => {
    const entry = getSectorEntry('agriculture-food-systems');
    expect(entry?.label_en).toMatch(/Agriculture/i);
    expect(entry?.definition_en).toMatch(/food/i);
    expect(Object.keys(entry?.term_crosswalk ?? {}).sort()).toEqual(
      [...CROSSWALK_SOURCE_IDS].sort()
    );
  });
});

describe('crosswalk cell parsing', () => {
  it('splits exact terms and skips soft cells', () => {
    expect(parseCrosswalkCell('Financial; Insurance')).toEqual(['Financial', 'Insurance']);
    expect(parseCrosswalkCell('(No direct equivalent)')).toEqual([]);
    expect(parseCrosswalkCell('(Included in Community)')).toEqual([]);
    expect(parseCrosswalkCell('Formation (Services aux entreprises)')).toEqual([
      'Formation (Services aux entreprises)',
      'Formation',
    ]);
  });

  it('normalizes accents and punctuation', () => {
    expect(normalizeCrosswalkTerm('Santé & Services aux personnes')).toBe(
      normalizeCrosswalkTerm('Sante and Services aux personnes')
    );
  });
});

describe('resolveSectorFromCrosswalk', () => {
  it('maps exact directory terms to sector ids', () => {
    expect(resolveSectorFromCrosswalk('Agroalimentaire', 'chantier')).toBe(
      'agriculture-food-systems'
    );
    expect(resolveSectorFromCrosswalk('Housing', 'cmc')).toBe('housing-collective-real-estate');
    expect(resolveSectorFromCrosswalk('TIC', 'chantier')).toBe(
      'technology-digital-infrastructure'
    );
  });

  it('treats RIPESS Media & Digital Commons as ambiguous', () => {
    const matches = resolveCrosswalkMatches('Media & Digital Commons', 'ripess');
    expect(new Set(matches.map((m) => m.sectorId))).toEqual(
      new Set(['arts-culture-information', 'technology-digital-infrastructure'])
    );
    expect(resolveSectorFromCrosswalk('Media & Digital Commons', 'ripess')).toBeNull();
  });

  it('does not reverse soft Included-in Community onto arts', () => {
    const matches = resolveCrosswalkMatches('Community', 'cmc');
    expect(matches.map((m) => m.sectorId)).toEqual(['community-civic-infrastructure']);
  });
});

describe('buildSourceCategoriesPayload', () => {
  it('partitions resolved, ambiguous, and unresolved terms', () => {
    const payload = buildSourceCategoriesPayload(
      ['Agroalimentaire', 'Media & Digital Commons', 'Not A Real Category'],
      'chantier'
    );
    expect(payload.resolved_sector_ids).toEqual(['agriculture-food-systems']);
    expect(payload.unresolved_terms).toEqual([
      'Media & Digital Commons',
      'Not A Real Category',
    ]);
    expect(payload.vocab).toBe('chantier');
  });
});
