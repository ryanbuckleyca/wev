import { describe, it, expect } from 'vitest';
import { formatOrgLocationLabel, resolveOrgSortBy } from './utils';

describe('resolveOrgSortBy', () => {
  it('keeps date and values sorts whether or not the user is logged in', () => {
    expect(resolveOrgSortBy('date-desc', false)).toBe('date-desc');
    expect(resolveOrgSortBy('value-match-desc', false)).toBe('value-match-desc');
    expect(resolveOrgSortBy('value-match-desc', true)).toBe('value-match-desc');
    expect(resolveOrgSortBy('org-asc', false)).toBe('org-asc');
  });

  it('falls back for unknown sort values', () => {
    expect(resolveOrgSortBy('nope', false)).toBe('org-asc');
    expect(resolveOrgSortBy('nope', true)).toBe('value-match-desc');
  });
});

describe('formatOrgLocationLabel', () => {
  it('prefers municipality and province', () => {
    expect(
      formatOrgLocationLabel({
        location: 'Somewhere',
        municipality: 'Montreal',
        province: 'QC',
      }),
    ).toBe('Montreal, QC');
  });

  it('returns municipality alone when province is missing', () => {
    expect(
      formatOrgLocationLabel({
        location: 'Somewhere',
        municipality: 'Montreal',
        province: null,
      }),
    ).toBe('Montreal');
  });

  it('returns province alone when municipality is missing', () => {
    expect(
      formatOrgLocationLabel({
        location: 'Somewhere',
        municipality: null,
        province: 'QC',
      }),
    ).toBe('QC');
  });

  it('falls back to free-text location', () => {
    expect(
      formatOrgLocationLabel({
        location: 'Toronto',
        municipality: null,
        province: null,
      }),
    ).toBe('Toronto');
  });

  it('ignores whitespace-only municipality or province and uses location', () => {
    expect(
      formatOrgLocationLabel({
        location: 'Toronto',
        municipality: '   ',
        province: '\t',
      }),
    ).toBe('Toronto');
  });

  it('returns null when nothing is set', () => {
    expect(
      formatOrgLocationLabel({ location: null, municipality: null, province: null }),
    ).toBeNull();
  });
});
