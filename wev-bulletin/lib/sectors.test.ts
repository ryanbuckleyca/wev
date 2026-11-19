import { describe, expect, it } from 'vitest';
import {
  buildSourceCategoriesPayload,
  canonicalizeSectorId,
  getSectorEntry,
  isValidSector,
  normalizeCrosswalkTerm,
  resolveSectorFromCrosswalk,
  SECTORS_LIST,
  SECTOR_TAXONOMY_VERSION,
} from './sectors';

describe('sector taxonomy v2.5', () => {
  it('exposes seventeen industry sector ids', () => {
    expect(SECTORS_LIST).toHaveLength(17);
    expect(SECTOR_TAXONOMY_VERSION).toBe('2.5');
    expect(isValidSector('agriculture-food-systems')).toBe(true);
    expect(isValidSector('employment-workforce-integration')).toBe(true);
    expect(isValidSector('facet-role-function')).toBe(false);
  });

  it('restores MASTER definitions and remaps legacy ids', () => {
    const entry = getSectorEntry('agriculture-food-systems');
    expect(entry?.category_id).toBe('SSE_SEC_07');
    expect(entry?.definition_en).toMatch(/Sustainable farming/i);
    expect(canonicalizeSectorId('arts-culture-information')).toBe('arts-culture-media');
    expect(canonicalizeSectorId('care-health-social-services')).toBe('social-health-care-services');
  });
});

describe('crosswalk resolution', () => {
  it('maps unified EN/FR labels to sector ids', () => {
    expect(resolveSectorFromCrosswalk('Agriculture & Food Systems')).toBe(
      'agriculture-food-systems',
    );
    expect(resolveSectorFromCrosswalk('Agriculture durable et systèmes alimentaires')).toBe(
      'agriculture-food-systems',
    );
    expect(resolveSectorFromCrosswalk('Advocacy, Rights & Representation')).toBe(
      'advocacy-rights-representation',
    );
  });

  it('normalizes accents', () => {
    expect(normalizeCrosswalkTerm('Éducation, petite enfance et savoirs')).toBe(
      normalizeCrosswalkTerm('Education, petite enfance et savoirs'),
    );
  });
});

describe('buildSourceCategoriesPayload', () => {
  it('partitions sectors, facets, and unresolved terms', () => {
    const payload = buildSourceCategoriesPayload([
      'Recreation, Tourism & Hospitality',
      'Not a sector: population, cause or geography',
      'Not A Real Category',
    ]);
    expect(payload.resolved_sector_ids).toEqual(['recreation-tourism-hospitality']);
    expect(payload.facet_ids).toEqual(['facet-population-cause-geography']);
    expect(payload.unresolved_terms).toEqual(['Not A Real Category']);
  });
});
