import { describe, it, expect } from 'vitest';
import {
  getOrgGovernanceDisplayLabel,
  hasPublicGovernanceSubtype,
} from './governance-labels';

const t = Object.assign((key: string) => key, {
  has: (key: string) =>
    key === 'governance.subtype.GOV_1_1_WORKER_COOP' ||
    key === 'governance.subtype.EXCLUDED_NON_SSE',
});

describe('hasPublicGovernanceSubtype', () => {
  it('is false for unset and EXCLUDED_NON_SSE', () => {
    expect(hasPublicGovernanceSubtype(null)).toBe(false);
    expect(hasPublicGovernanceSubtype(undefined)).toBe(false);
    expect(hasPublicGovernanceSubtype('EXCLUDED_NON_SSE')).toBe(false);
  });

  it('is true for SSE subtypes', () => {
    expect(hasPublicGovernanceSubtype('GOV_1_1_WORKER_COOP')).toBe(true);
  });
});

describe('getOrgGovernanceDisplayLabel', () => {
  const typeLabel = (type: string | null | undefined) =>
    type === 'private' ? 'Private' : type ?? null;

  it('prefers the governance subtype for SSE orgs', () => {
    expect(
      getOrgGovernanceDisplayLabel(
        { governance_subtype: 'GOV_1_1_WORKER_COOP', type: 'cooperative' },
        t,
        typeLabel,
      ),
    ).toBe('governance.subtype.GOV_1_1_WORKER_COOP');
  });

  it('falls back to legacy type for EXCLUDED_NON_SSE instead of a public exclusion label', () => {
    expect(
      getOrgGovernanceDisplayLabel(
        { governance_subtype: 'EXCLUDED_NON_SSE', type: 'private' },
        t,
        typeLabel,
      ),
    ).toBe('Private');
  });

  it('falls back to legacy type when governance is unset', () => {
    expect(
      getOrgGovernanceDisplayLabel({ governance_subtype: null, type: 'private' }, t, typeLabel),
    ).toBe('Private');
  });
});
