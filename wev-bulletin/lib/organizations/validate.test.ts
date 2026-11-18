import { describe, it, expect } from 'vitest';
import {
  normalizeOrgValuesList,
  validateOrgInput,
  buildOrgPayload,
  buildOrgUpdateFields,
} from './validate';

describe('normalizeOrgValuesList', () => {
  it('dedupes values', () => {
    expect(normalizeOrgValuesList(['Help Society', 'Help Society'])).toEqual(['Help Society']);
  });
});

describe('validateOrgInput', () => {
  it('accepts a minimal valid org', () => {
    expect(
      validateOrgInput({
        name: 'Example Co-op',
        slug: 'example-coop',
        is_sse: true,
        governance_subtype: 'GOV_1_1_WORKER_COOP',
      }),
    ).toBeNull();
  });

  it('rejects an invalid governance subtype', () => {
    expect(
      validateOrgInput({
        name: 'Example Co-op',
        slug: 'example-coop',
        governance_subtype: 'NOT_A_CODE',
      }),
    ).toEqual({ field: 'governance_subtype', error: 'invalid_governance' });
  });
});

describe('buildOrgPayload', () => {
  it('stores city autocomplete fields with city accuracy', () => {
    const payload = buildOrgPayload({
      name: 'Co-op Example',
      slug: 'co-op-example',
      location: 'Montreal, QC',
      municipality: 'Montreal',
      province: 'QC',
      lat: 45.5,
      lng: -73.6,
    });

    expect(payload).toMatchObject({
      location: 'Montreal, QC',
      municipality: 'Montreal',
      province: 'QC',
      lat: 45.5,
      lng: -73.6,
      geocode_accuracy_type: 'city',
    });
  });

  it('persists governance without a legacy type field', () => {
    const payload = buildOrgPayload({
      name: 'Example Co-op',
      slug: 'example-coop',
      is_sse: true,
      governance_subtype: 'GOV_1_1_WORKER_COOP',
    });
    expect(payload).not.toHaveProperty('type');
    expect(payload.governance_subtype).toBe('GOV_1_1_WORKER_COOP');
    expect(payload.governance_category).toBe('GOV_1');
    expect(payload.is_sse).toBe(true);
  });
});

describe('buildOrgUpdateFields', () => {
  it('rewrites sse fields only when is_sse changes', () => {
    expect(buildOrgUpdateFields({ is_sse: true }, { previousIsSse: true })).toEqual({
      is_sse: true,
    });

    const changed = buildOrgUpdateFields(
      { is_sse: false },
      { previousIsSse: true, previousGovernanceSubtype: 'GOV_1_1_WORKER_COOP' },
    );
    expect(changed.sse_rating).toBe('no');
    expect(changed.sse_details).toMatchObject({ flags: ['admin_override'] });
    expect(changed.governance_subtype).toBe('EXCLUDED_NON_SSE');
    expect(changed.governance_category).toBe('EXCLUDED');
    expect(changed.governance_confidence).toBeNull();
    expect(changed.governance_reasoning).toBeNull();
  });

  it('clears EXCLUDED governance on partial SSE promotion without a new subtype', () => {
    const changed = buildOrgUpdateFields(
      { is_sse: true },
      {
        previousIsSse: false,
        previousGovernanceSubtype: 'EXCLUDED_NON_SSE',
      },
    );
    expect(changed.is_sse).toBe(true);
    expect(changed.governance_subtype).toBeNull();
    expect(changed.governance_category).toBeNull();
    expect(changed.governance_confidence).toBeNull();
    expect(changed.governance_reasoning).toBeNull();
  });

  it('clears stale confidence/reasoning when the subtype changes', () => {
    const changed = buildOrgUpdateFields(
      { governance_subtype: 'GOV_4_1_MEMBER_NPO' },
      {
        previousIsSse: true,
        previousGovernanceSubtype: 'EXCLUDED_NON_SSE',
      },
    );
    expect(changed.governance_subtype).toBe('GOV_4_1_MEMBER_NPO');
    expect(changed.governance_category).toBe('GOV_4');
    expect(changed.governance_confidence).toBeNull();
    expect(changed.governance_reasoning).toBeNull();
  });

  it('does not touch governance on a partial update that leaves SSE unchanged', () => {
    const changed = buildOrgUpdateFields(
      { sector_id: 'housing' },
      {
        previousIsSse: true,
        previousGovernanceSubtype: 'EXCLUDED_NON_SSE',
      },
    );
    expect(changed).not.toHaveProperty('governance_subtype');
    expect(changed).not.toHaveProperty('governance_confidence');
  });

  it('forces EXCLUDED governance when SSE is turned off', () => {
    const changed = buildOrgUpdateFields(
      { is_sse: false },
      { previousIsSse: true, previousGovernanceSubtype: 'GOV_4_1_MEMBER_NPO' },
    );
    expect(changed.is_sse).toBe(false);
    expect(changed.sse_rating).toBe('no');
    expect(changed.governance_subtype).toBe('EXCLUDED_NON_SSE');
  });

  it('clears EXCLUDED when promoting back to SSE without a subtype', () => {
    const changed = buildOrgUpdateFields(
      { is_sse: true },
      { previousIsSse: false, previousGovernanceSubtype: 'EXCLUDED_NON_SSE' },
    );
    expect(changed.is_sse).toBe(true);
    expect(changed.governance_subtype).toBeNull();
  });

  it('clears geo fields when location is cleared', () => {
    expect(
      buildOrgUpdateFields({
        location: null,
        municipality: null,
        province: null,
        lat: null,
        lng: null,
      }),
    ).toEqual({
      location: null,
      municipality: null,
      province: null,
      lat: null,
      lng: null,
      geocode_accuracy_type: null,
    });
  });
});
