import { describe, expect, it } from 'vitest';
import {
  brandSourceOptions,
  canonicalizeSourceSelection,
  expandSourceFilterSelection,
  matchesSourceSelection,
  toSourceBrand,
} from './source-brands';

describe('toSourceBrand', () => {
  it('collapses WINP paid and volunteer board names', () => {
    expect(toSourceBrand('WorkInNonProfits Volunteer')).toBe('WorkInNonProfits');
    expect(toSourceBrand('WorkInNonProfits Jobs')).toBe('WorkInNonProfits');
    expect(toSourceBrand('Work In NonProfits Jobs')).toBe('WorkInNonProfits');
  });

  it('collapses Ma Communauté emplois and bénévolat board names', () => {
    expect(toSourceBrand('Ma Communauté Emplois')).toBe('Ma Communauté');
    expect(toSourceBrand('Ma Communauté Bénévolat')).toBe('Ma Communauté');
    expect(toSourceBrand('Ma Communauté (emplois)')).toBe('Ma Communauté');
    expect(toSourceBrand('Ma Communauté (bénévolat)')).toBe('Ma Communauté');
  });

  it('leaves unrelated boards unchanged', () => {
    expect(toSourceBrand('CharityVillage')).toBe('CharityVillage');
    expect(toSourceBrand('GoodWork')).toBe('GoodWork');
  });
});

describe('brandSourceOptions', () => {
  it('dedupes paired boards into one checkbox label', () => {
    expect(
      brandSourceOptions([
        'WorkInNonProfits Jobs',
        'CharityVillage',
        'WorkInNonProfits Volunteer',
        'Ma Communauté Bénévolat',
        'Ma Communauté Emplois',
      ]),
    ).toEqual(['CharityVillage', 'Ma Communauté', 'WorkInNonProfits']);
  });
});

describe('expandSourceFilterSelection', () => {
  it('expands a brand to seeded aliases without facet data', () => {
    expect(expandSourceFilterSelection(['WorkInNonProfits']).sort()).toEqual([
      'Work In NonProfits Jobs',
      'Work In NonProfits Volunteer',
      'WorkInNonProfits Jobs',
      'WorkInNonProfits Volunteer',
    ]);
    expect(expandSourceFilterSelection(['Ma Communauté']).sort()).toEqual([
      'Ma Communauté (bénévolat)',
      'Ma Communauté (emplois)',
      'Ma Communauté Bénévolat',
      'Ma Communauté Emplois',
    ]);
  });

  it('expands a legacy raw name to the full brand set', () => {
    expect(expandSourceFilterSelection(['WorkInNonProfits Volunteer']).sort()).toEqual([
      'Work In NonProfits Jobs',
      'Work In NonProfits Volunteer',
      'WorkInNonProfits Jobs',
      'WorkInNonProfits Volunteer',
    ]);
  });

  it('passes through ungrouped sources', () => {
    expect(expandSourceFilterSelection(['CharityVillage'])).toEqual(['CharityVillage']);
  });

  it('merges extra known facet names into the expansion', () => {
    expect(
      expandSourceFilterSelection(['WorkInNonProfits'], ['Work In NonProfits Extra']).sort(),
    ).toEqual([
      'Work In NonProfits Extra',
      'Work In NonProfits Jobs',
      'Work In NonProfits Volunteer',
      'WorkInNonProfits Jobs',
      'WorkInNonProfits Volunteer',
    ]);
  });
});

describe('matchesSourceSelection', () => {
  it('matches either board when the brand is selected', () => {
    expect(matchesSourceSelection('WorkInNonProfits Jobs', ['WorkInNonProfits'])).toBe(true);
    expect(matchesSourceSelection('WorkInNonProfits Volunteer', ['WorkInNonProfits'])).toBe(true);
    expect(matchesSourceSelection('CharityVillage', ['WorkInNonProfits'])).toBe(false);
  });

  it('matches when a legacy raw name is still in the URL', () => {
    expect(matchesSourceSelection('WorkInNonProfits Jobs', ['WorkInNonProfits Volunteer'])).toBe(
      true,
    );
  });
});

describe('canonicalizeSourceSelection', () => {
  it('collapses legacy raw names to brands', () => {
    expect(
      canonicalizeSourceSelection([
        'WorkInNonProfits Jobs',
        'WorkInNonProfits Volunteer',
        'GoodWork',
      ]),
    ).toEqual(['GoodWork', 'WorkInNonProfits']);
  });
});
