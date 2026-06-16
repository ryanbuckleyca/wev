import { describe, expect, it } from 'vitest';
import enMessages from '@/messages/en.json';
import { buildJobLanguageOptions, getJobLanguageLabel } from './filter-labels';

const t = (key: string) => {
  const parts = key.split('.');
  let value: unknown = enMessages;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof value === 'string' ? value : key;
};

describe('filter-labels', () => {
  it('getJobLanguageLabel returns known labels', () => {
    expect(getJobLanguageLabel('en', t)).toBe('English');
    expect(getJobLanguageLabel('fr', t)).toBe('French');
    expect(getJobLanguageLabel('bilingual', t)).toBe('Bilingual');
    expect(getJobLanguageLabel('other', t)).toBe('other');
  });

  it('buildJobLanguageOptions shows all known values when facets are empty', () => {
    expect(buildJobLanguageOptions([], t).map((option) => option.value)).toEqual([
      'en',
      'fr',
      'bilingual',
    ]);
  });

  it('buildJobLanguageOptions scopes to facet languages when present', () => {
    expect(buildJobLanguageOptions(['en', 'fr'], t).map((option) => option.value)).toEqual([
      'en',
      'fr',
    ]);
  });
});
