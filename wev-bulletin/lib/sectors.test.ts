import { describe, expect, it } from 'vitest';
import {
  buildSourceCategoriesPayload,
  canonicalizeSectorId,
  expandSectorFilterIds,
  getSectorEntry,
  isValidSector,
  normalizeCrosswalkTerm,
  persistableSectorId,
  resolveCrosswalkMatches,
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
    expect(canonicalizeSectorId('  care-health-social-services  ')).toBe(
      'social-health-care-services',
    );
    expect(canonicalizeSectorId('   ')).toBeNull();
  });

  it('expands canonical filter ids with legacy stored ids for rollout', () => {
    expect(expandSectorFilterIds(['arts-culture-media']).sort()).toEqual(
      ['arts-culture-information', 'arts-culture-media'].sort(),
    );
    expect(expandSectorFilterIds(['social-health-care-services']).sort()).toEqual(
      ['care-health-social-services', 'social-health-care-services'].sort(),
    );
  });

  it('treats constructor as an unknown expand value without throwing', () => {
    expect(() => expandSectorFilterIds(['constructor'])).not.toThrow();
    expect(expandSectorFilterIds(['constructor'])).toEqual(['constructor']);
  });

  it('keeps ambiguous community-civic unclassified on persist', () => {
    expect(canonicalizeSectorId('community-civic-infrastructure')).toBe(
      'community-development-philanthropy-volunteering',
    );
    expect(persistableSectorId('community-civic-infrastructure')).toBeNull();
  });

  it('resolves documented facet example values', () => {
    expect(resolveCrosswalkMatches('Accounting').map((m) => m.entryId)).toContain(
      'facet-role-function',
    );
    expect(resolveCrosswalkMatches('Youth').map((m) => m.entryId)).toContain(
      'facet-population-cause-geography',
    );
    expect(resolveCrosswalkMatches('Non-Profit').map((m) => m.entryId)).toContain(
      'facet-employer-type',
    );
    expect(normalizeCrosswalkTerm('Non_Profit')).toBe(normalizeCrosswalkTerm('Non-Profit'));
    expect(normalizeCrosswalkTerm('Non Profit')).toBe(normalizeCrosswalkTerm('Non-Profit'));
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
    expect(resolveSectorFromCrosswalk('Housing & Collective Real Estate')).toBe(
      'housing-collective-real-estate',
    );
  });

  it('keeps CMC source terms from matching GoodWork lookups', () => {
    expect(resolveSectorFromCrosswalk('CMC Housing & Collective Real Estate', 'cmc')).toBe(
      'housing-collective-real-estate',
    );
    expect(
      resolveSectorFromCrosswalk('CMC Housing & Collective Real Estate', 'goodwork'),
    ).toBeNull();
    // CQCM facet cells must not collapse into CMC aliases via colon stripping.
    expect(
      resolveCrosswalkMatches('CQCM Not a sector: role / function', 'cmc')
    ).toEqual([]);
    expect(
      resolveCrosswalkMatches('Not a sector: role / function').some(
        (m) => m.entryId === 'facet-role-function',
      ),
    ).toBe(true);
    expect(resolveSectorFromCrosswalk('Housing & Collective Real Estate', 'goodwork')).toBe(
      'housing-collective-real-estate',
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
