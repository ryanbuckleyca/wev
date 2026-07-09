import { describe, it, expect } from 'vitest';
import { getOrganizationTypeLabel, normalizeOrgTypeKey } from './utils';

describe('normalizeOrgTypeKey', () => {
  it('strips spaces, hyphens, and underscores', () => {
    expect(normalizeOrgTypeKey('non-profit')).toBe('nonprofit');
    expect(normalizeOrgTypeKey('social enterprise')).toBe('socialenterprise');
  });
});

describe('getOrganizationTypeLabel', () => {
  const t = Object.assign(
    (key: string) => {
      const labels: Record<string, string> = {
        nonprofit: 'Nonprofit',
        'type.nonprofit': 'Nonprofit (nested)',
      };
      return labels[key] ?? key;
    },
    {
      has: (key: string) => key === 'nonprofit' || key === 'type.nonprofit',
    },
  );

  it('resolves non-profit via normalization', () => {
    expect(getOrganizationTypeLabel('non-profit', t)).toBe('Nonprofit');
  });

  it('returns raw type when no translation exists', () => {
    expect(getOrganizationTypeLabel('custom-type', t)).toBe('custom-type');
  });

  it('returns null for empty input', () => {
    expect(getOrganizationTypeLabel(null, t)).toBeNull();
  });
});
