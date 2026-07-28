import { describe, expect, it } from 'vitest';
import { pickOrgLocalizedText, pickSseReasoning } from './localized';

describe('pickOrgLocalizedText', () => {
  const org = {
    description: 'Legacy description',
    description_en: 'English description',
    description_fr: 'Description française',
    mission_statement: null,
    mission_statement_en: 'English mission',
    mission_statement_fr: null,
  };

  it('prefers matching locale', () => {
    expect(pickOrgLocalizedText(org, 'description', 'fr')).toBe('Description française');
    expect(pickOrgLocalizedText(org, 'description', 'en')).toBe('English description');
  });

  it('falls back to other locale then legacy', () => {
    expect(pickOrgLocalizedText(org, 'mission_statement', 'fr')).toBe('English mission');
    expect(
      pickOrgLocalizedText(
        { description: 'Legacy only', description_en: null, description_fr: null },
        'description',
        'fr',
      ),
    ).toBe('Legacy only');
  });
});

describe('pickSseReasoning', () => {
  it('prefers locale-specific reasoning', () => {
    expect(
      pickSseReasoning(
        {
          reasoning: 'Legacy',
          reasoning_en: 'English reason',
          reasoning_fr: 'Raison française',
        },
        'fr',
      ),
    ).toBe('Raison française');
  });
});
