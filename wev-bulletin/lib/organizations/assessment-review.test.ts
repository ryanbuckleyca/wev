import { describe, it, expect } from 'vitest';
import {
  ORG_ASSESSMENT_FIELDS,
  ORG_SKIP_REASON_IGNORED,
  findMissingOrgFields,
  identityFieldsChanged,
  isOrgAssessmentComplete,
  resolveSkipReasonAfterSave,
} from './assessment-review';

const completeOrg = {
  sector_id: 'housing',
  type: 'cooperative',
  description_en: 'Member-owned housing.',
  description_fr: 'Logement détenu par les membres.',
  language: 'en',
  values_list: ['Community'],
};

describe('findMissingOrgFields', () => {
  it('returns nothing for a complete org', () => {
    expect(findMissingOrgFields(completeOrg)).toEqual([]);
  });

  it('names the single missing field, as Alcoa hit with values', () => {
    expect(findMissingOrgFields({ ...completeOrg, values_list: [] })).toEqual(['values']);
  });

  it('lists every missing field in form order', () => {
    expect(findMissingOrgFields({})).toEqual([...ORG_ASSESSMENT_FIELDS]);
  });

  it('counts a language outside en/fr/bilingual as missing', () => {
    expect(findMissingOrgFields({ ...completeOrg, language: 'es' })).toEqual(['language']);
  });

  it('accepts the legacy description column in place of description_en', () => {
    const org = { ...completeOrg, description_en: null, description: 'Legacy copy.' };
    expect(findMissingOrgFields(org)).toEqual([]);
  });
});

describe('isOrgAssessmentComplete', () => {
  it('accepts an org with every required field', () => {
    expect(isOrgAssessmentComplete(completeOrg)).toBe(true);
  });

  it.each([
    ['sector_id', { sector_id: null }],
    ['type', { type: null }],
    ['description_fr', { description_fr: null }],
    ['language', { language: null }],
  ])('rejects an org missing %s', (_field, override) => {
    expect(isOrgAssessmentComplete({ ...completeOrg, ...override })).toBe(false);
  });

  it('rejects blank-but-present text', () => {
    expect(isOrgAssessmentComplete({ ...completeOrg, description_fr: '   ' })).toBe(false);
  });

  it('rejects an empty values_list', () => {
    expect(isOrgAssessmentComplete({ ...completeOrg, values_list: [] })).toBe(false);
  });

  it('rejects a language outside en/fr/bilingual', () => {
    expect(isOrgAssessmentComplete({ ...completeOrg, language: 'es' })).toBe(false);
  });

  it('accepts bilingual', () => {
    expect(isOrgAssessmentComplete({ ...completeOrg, language: 'bilingual' })).toBe(true);
  });

  it('falls back to the legacy description column', () => {
    const org = { ...completeOrg, description_en: null, description: 'Legacy blurb.' };
    expect(isOrgAssessmentComplete(org)).toBe(true);
  });
});

describe('identityFieldsChanged', () => {
  const existing = {
    name: 'City of St. Catharines',
    website: 'https://stcatharines.ca',
    municipality: 'Sainte-Catherine',
    province: 'QC',
    location: 'Sainte-Catherine, QC',
  };

  it('detects a changed municipality', () => {
    expect(identityFieldsChanged(existing, { municipality: 'St. Catharines' })).toBe(true);
  });

  it('ignores identity fields resubmitted unchanged', () => {
    expect(identityFieldsChanged(existing, { municipality: 'Sainte-Catherine' })).toBe(false);
  });

  it('treats whitespace-only differences as unchanged', () => {
    expect(identityFieldsChanged(existing, { name: '  City of St. Catharines  ' })).toBe(false);
  });

  it('treats empty string and null as the same absence', () => {
    expect(identityFieldsChanged({ website: null }, { website: '' })).toBe(false);
  });

  it('ignores non-identity fields', () => {
    expect(identityFieldsChanged(existing, { description_en: 'Totally new copy' })).toBe(false);
  });

  it('does not treat clearing a field as a corrected identity', () => {
    expect(identityFieldsChanged(existing, { website: null })).toBe(false);
  });

  it('does not treat the form nulling municipality/province as a correction', () => {
    // The admin form sends these as null when the location picker has no coords.
    expect(
      identityFieldsChanged(existing, {
        location: 'Sainte-Catherine, QC',
        municipality: null,
        province: null,
      }),
    ).toBe(false);
  });
});

describe('resolveSkipReasonAfterSave', () => {
  const incomplete = { ...completeOrg, sector_id: null };

  it('leaves an unparked org alone', () => {
    expect(
      resolveSkipReasonAfterSave({
        previousReason: null,
        merged: incomplete,
        identityChanged: true,
      }),
    ).toBeUndefined();
  });

  it('clears the reason once the org is complete', () => {
    expect(
      resolveSkipReasonAfterSave({
        previousReason: 'partial_fill',
        merged: completeOrg,
        identityChanged: false,
      }),
    ).toBeNull();
  });

  it('clears the reason when identity changed but the org is still incomplete', () => {
    expect(
      resolveSkipReasonAfterSave({
        previousReason: 'location_mismatch',
        merged: incomplete,
        identityChanged: true,
      }),
    ).toBeNull();
  });

  it('leaves the reason on a cosmetic edit', () => {
    expect(
      resolveSkipReasonAfterSave({
        previousReason: 'location_mismatch',
        merged: incomplete,
        identityChanged: false,
      }),
    ).toBeUndefined();
  });

  it('keeps an explicit Ignore even when identity changed', () => {
    expect(
      resolveSkipReasonAfterSave({
        previousReason: ORG_SKIP_REASON_IGNORED,
        merged: incomplete,
        identityChanged: true,
      }),
    ).toBeUndefined();
  });

  it('still clears an Ignore once the org is complete', () => {
    expect(
      resolveSkipReasonAfterSave({
        previousReason: ORG_SKIP_REASON_IGNORED,
        merged: completeOrg,
        identityChanged: false,
      }),
    ).toBeNull();
  });
});
