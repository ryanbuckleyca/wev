import { describe, expect, it, vi } from 'vitest';
import enMessages from '@/messages/en.json';
import { buildActiveFilterChips, type ActiveFilterChipInputs } from './build-active-filter-chips';

function createInput(overrides: Partial<ActiveFilterChipInputs> = {}): ActiveFilterChipInputs {
  return {
    postedWithin: 'any',
    showNonSse: false,
    showJobsWithoutSalary: true,
    searchQuery: '',
    selectedWorkTypes: [],
    selectedProvinces: [],
    selectedMunicipalities: [],
    selectedOrganizations: [],
    selectedEmploymentTypes: [],
    selectedSources: [],
    selectedLanguages: [],
    onPostedWithinChange: vi.fn(),
    onShowNonSseChange: vi.fn(),
    onShowJobsWithoutSalaryChange: vi.fn(),
    onSearchChange: vi.fn(),
    onWorkTypesChange: vi.fn(),
    onProvincesChange: vi.fn(),
    onMunicipalitiesChange: vi.fn(),
    onOrganizationsChange: vi.fn(),
    onEmploymentTypesChange: vi.fn(),
    onSourcesChange: vi.fn(),
    onLanguagesChange: vi.fn(),
    ...overrides,
  };
}

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

describe('buildActiveFilterChips', () => {
  it('builds chips in stable order with remove handlers', () => {
    const input = createInput({
      postedWithin: '1-week',
      showNonSse: true,
      showJobsWithoutSalary: false,
      searchQuery: 'climate policy',
      selectedWorkTypes: ['remote'],
      selectedProvinces: ['Ontario'],
      selectedEmploymentTypes: ['Full-time'],
      selectedLanguages: ['en'],
    });

    const chips = buildActiveFilterChips(input, t);

    expect(chips.map((chip) => chip.id)).toEqual([
      'posted-within',
      'nonSse',
      'salary',
      'search',
      'work-type-remote',
      'province-Ontario',
      'employment-type-Full-time',
      'language-en',
    ]);

    chips.find((chip) => chip.id === 'search')?.onRemove?.();
    expect(input.onSearchChange).toHaveBeenCalledWith('');

    chips.find((chip) => chip.id === 'work-type-remote')?.onRemove?.();
    expect(input.onWorkTypesChange).toHaveBeenCalledWith([]);
  });

  it('uses full search query in chip title when label is truncated', () => {
    const longQuery = 'a'.repeat(30);
    const input = createInput({ searchQuery: longQuery });
    const chips = buildActiveFilterChips(input, t);
    const searchChip = chips.find((chip) => chip.id === 'search');

    expect(searchChip?.label).toContain('…');
    expect(searchChip?.title).toContain(longQuery);
  });

  it('uses employment type labels verbatim', () => {
    const input = createInput({
      selectedEmploymentTypes: ['Contract'],
    });

    const chips = buildActiveFilterChips(input, t);
    const employmentChip = chips.find((chip) => chip.id === 'employment-type-Contract');

    expect(employmentChip?.label).toBe('Contract');
    expect(employmentChip?.title).toBe('Contract');
  });
});
