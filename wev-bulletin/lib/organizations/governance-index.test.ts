import { describe, expect, it } from 'vitest';
import { buildGovernanceIndexCards } from './governance-index';

describe('buildGovernanceIndexCards', () => {
  it('aggregates SSE categories in taxonomy order and omits EXCLUDED', () => {
    const cards = buildGovernanceIndexCards([
      { name: 'Coop A', governance_category: 'GOV_1' },
      { name: 'Coop B', governance_category: 'GOV_1' },
      { name: 'NPO', governance_category: 'GOV_4' },
      { name: 'Private', governance_category: 'EXCLUDED' },
      { name: null, governance_category: 'GOV_1' },
      { name: 'Unknown', governance_category: 'GOV_99' },
    ]);

    expect(cards.map((c) => c.id)).toEqual(['GOV_1', 'GOV_4']);
    expect(cards[0]).toMatchObject({
      id: 'GOV_1',
      orgCount: 3,
      sampleNames: ['Coop A', 'Coop B'],
    });
    expect(cards[1].orgCount).toBe(1);
  });
});
