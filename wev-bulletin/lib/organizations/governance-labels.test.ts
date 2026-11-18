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
  it('returns the governance subtype for SSE orgs', () => {
    expect(
      getOrgGovernanceDisplayLabel({ governance_subtype: 'GOV_1_1_WORKER_COOP' }, t),
    ).toBe('governance.subtype.GOV_1_1_WORKER_COOP');
  });

  it('returns null for EXCLUDED_NON_SSE', () => {
    expect(
      getOrgGovernanceDisplayLabel({ governance_subtype: 'EXCLUDED_NON_SSE' }, t),
    ).toBeNull();
  });

  it('returns null when governance is unset', () => {
    expect(getOrgGovernanceDisplayLabel({ governance_subtype: null }, t)).toBeNull();
  });
});
