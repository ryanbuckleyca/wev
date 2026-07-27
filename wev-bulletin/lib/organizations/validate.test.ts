import { describe, it, expect } from 'vitest';
import { normalizeOrgType } from './org-type';
import {
  normalizeOrgValuesList,
  validateOrgInput,
  buildOrgPayload,
  buildOrgUpdateFields,
} from './validate';

describe('normalizeOrgType', () => {
  it('normalizes hyphenated and underscored variants', () => {
    expect(normalizeOrgType('non-profit')).toBe('nonprofit');
    expect(normalizeOrgType('social_enterprise')).toBe('social enterprise');
    expect(normalizeOrgType('Social Enterprise')).toBe('social enterprise');
  });

  it('returns null for unknown types', () => {
    expect(normalizeOrgType('for-profit')).toBeNull();
  });
});

describe('normalizeOrgValuesList', () => {
  it('keeps only valid Knowdell value IDs', () => {
    expect(normalizeOrgValuesList(['Community', 'NotAValue', 'Community'])).toEqual(['Community']);
  });

  it('limits to five values', () => {
    const values = [
      'Advancement',
      'Aesthetic',
      'Challenge',
      'Community',
      'Competence',
      'Creativity',
    ];
    expect(normalizeOrgValuesList(values)).toHaveLength(5);
  });
});

describe('validateOrgInput', () => {
  it('rejects missing name on create', () => {
    expect(validateOrgInput({ name: '  ' })).toEqual({
      field: 'name',
      error: 'name_required',
    });
  });

  it('rejects invalid slug format', () => {
    expect(validateOrgInput({ name: 'Test Org', slug: 'Bad Slug' })).toEqual({
      field: 'slug',
      error: 'slug_invalid',
    });
  });

  it('rejects website without scheme', () => {
    expect(
      validateOrgInput({ name: 'Test Org', slug: 'test-org', website: 'example.org' }),
    ).toEqual({ field: 'website', error: 'website_invalid' });
  });
});

describe('buildOrgPayload', () => {
  it('populates values_list, sse_rating, and admin sse_details', () => {
    const payload = buildOrgPayload({
      name: 'Co-op Example',
      slug: 'co-op-example',
      is_sse: true,
      values_list: ['Community', 'Creativity'],
    });

    expect(payload.values_list).toEqual(['Community', 'Creativity']);
    expect(payload.values).toBe('Community, Creativity');
    expect(payload.values_rated).toEqual([
      { value: 'Community', rank: 1 },
      { value: 'Creativity', rank: 2 },
    ]);
    expect(payload.sse_rating).toBe('weak_yes');
    expect(payload.sse_details).toMatchObject({
      reviewed: true,
      flags: ['admin_override'],
    });
  });

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
  it('forces is_sse false for government orgs', () => {
    const payload = buildOrgPayload({
      name: 'City Parks',
      slug: 'city-parks',
      type: 'government',
      is_sse: true,
    });
    expect(payload.type).toBe('government');
    expect(payload.is_sse).toBe(false);
    expect(payload.sse_rating).toBe('no');
  });
});

describe('buildOrgUpdateFields', () => {
  it('rewrites sse fields only when is_sse changes', () => {
    expect(buildOrgUpdateFields({ is_sse: true }, { previousIsSse: true })).toEqual({
      is_sse: true,
    });

    const changed = buildOrgUpdateFields({ is_sse: false }, { previousIsSse: true });
    expect(changed.sse_rating).toBe('no');
    expect(changed.sse_details).toMatchObject({ flags: ['admin_override'] });
  });

  it('clears is_sse when type becomes government', () => {
    const changed = buildOrgUpdateFields(
      { type: 'government' },
      { previousIsSse: true, previousType: 'nonprofit' },
    );
    expect(changed.type).toBe('government');
    expect(changed.is_sse).toBe(false);
    expect(changed.sse_rating).toBe('no');
  });

  it('rejects is_sse true while type remains government', () => {
    const changed = buildOrgUpdateFields(
      { is_sse: true },
      { previousIsSse: false, previousType: 'government' },
    );
    expect(changed.is_sse).toBe(false);
    expect(changed.sse_rating).toBe('no');
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
