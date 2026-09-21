import { describe, expect, it } from 'vitest';
import { buildSectorIndexCards, sectorBlurb } from './sector-index';

describe('sectorBlurb', () => {
  it('strips the Example prefix in English', () => {
    const blurb = sectorBlurb('agriculture-food-systems', 'en');
    expect(blurb).toBeTruthy();
    expect(blurb!.toLowerCase().startsWith('example')).toBe(false);
    expect(blurb).toMatch(/csa|farm|food/i);
  });

  it('strips the Exemple prefix in French', () => {
    const blurb = sectorBlurb('agriculture-food-systems', 'fr');
    expect(blurb).toBeTruthy();
    expect(blurb!.toLowerCase().startsWith('exemple')).toBe(false);
  });

  it('returns null for unknown sectors', () => {
    expect(sectorBlurb('not-a-sector', 'en')).toBeNull();
  });
});

describe('buildSectorIndexCards', () => {
  it('aggregates counts, type mix, and sample names in taxonomy order', () => {
    const cards = buildSectorIndexCards([
      { name: 'Zulu Co-op', type: 'cooperative', sector_id: 'agriculture-food-systems' },
      { name: 'Alpha Farm', type: 'nonprofit', sector_id: 'agriculture-food-systems' },
      { name: 'Beta Bank', type: 'nonprofit', sector_id: 'agriculture-food-systems' },
      { name: 'Extra Farm', type: 'nonprofit', sector_id: 'agriculture-food-systems' },
      { name: 'Radio Co-op', type: 'cooperative', sector_id: 'arts-culture-information' },
      { name: 'No Sector', type: 'nonprofit', sector_id: null },
      { name: 'Bad Sector', type: 'nonprofit', sector_id: 'not-real' },
    ]);

    expect(cards.map((c) => c.id)).toEqual([
      'agriculture-food-systems',
      'arts-culture-information',
    ]);
    expect(cards[0]).toEqual({
      id: 'agriculture-food-systems',
      orgCount: 4,
      typeCounts: [
        { type: 'nonprofit', count: 3 },
        { type: 'cooperative', count: 1 },
      ],
      sampleNames: ['Alpha Farm', 'Beta Bank', 'Extra Farm'],
    });
    expect(cards[1].orgCount).toBe(1);
    expect(cards[1].sampleNames).toEqual(['Radio Co-op']);
  });
});
