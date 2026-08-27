import { describe, it, expect, vi } from 'vitest';
import { buildOrgActiveFilterChips, toggleArrayItem } from './build-org-active-filter-chips';
import type { OrganizationFilters } from '@/lib/hooks/useOrganizationFilters';

describe('buildOrgActiveFilterChips', () => {
  const mockTOrgs = Object.assign(
    vi.fn((key: string) => {
      const map: Record<string, string> = {
        nonprofit: 'Non-Profit',
        forprofit: 'For-Profit',
        government: 'Government',
      };
      return map[key] ?? key;
    }),
    {
      has: (key: string) => {
        const validKeys = ['nonprofit', 'forprofit', 'government'];
        return validKeys.includes(key);
      },
    },
  );

  const mockTFilters = vi.fn((key: string) => {
    const map: Record<string, string> = {
      'chips.allOrgs': 'All organizations',
      'language.en': 'English',
      'language.fr': 'French',
      'language.bilingual': 'Bilingual',
    };
    return map[key] ?? key;
  });

  const baseFilters: OrganizationFilters = {
    searchQuery: '',
    showNonSse: false,
    selectedProvinces: [],
    selectedMunicipalities: [],
    selectedTypes: [],
    selectedLanguages: [],
    selectedSectors: [],
    activityWindow: 'all',
  };

  const mockTSectors = vi.fn((key: string) => key);

  const baseChipHandlers = {
    onRemoveActivity: vi.fn(),
    onRemoveNonSse: vi.fn(),
    onRemoveSearch: vi.fn(),
    onRemoveProvince: vi.fn(),
    onRemoveMunicipality: vi.fn(),
    onRemoveType: vi.fn(),
    onRemoveLanguage: vi.fn(),
    onRemoveSector: vi.fn(),
    tOrgs: mockTOrgs,
    tFilters: mockTFilters,
    tSectors: mockTSectors,
  };

  it('returns empty array when no filters are active', () => {
    const chips = buildOrgActiveFilterChips({
      filters: baseFilters,
      ...baseChipHandlers,
    });

    expect(chips).toEqual([]);
  });

  it('creates a chip for activity window', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, activityWindow: '28d' },
      ...baseChipHandlers,
      onRemoveActivity: onRemove,
    });

    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe('activity');
    expect(chips[0].label).toBe('activity28d');
    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalled();
  });

  it('creates a chip for showNonSse filter', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, showNonSse: true },
      ...baseChipHandlers,
      onRemoveNonSse: onRemove,
    });

    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe('nonSse');
    expect(chips[0].label).toBe('All organizations');
    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalled();
  });

  it('creates a chip for search query', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, searchQuery: 'Test Query' },
      ...baseChipHandlers,
      onRemoveSearch: onRemove,
    });

    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe('q');
    expect(chips[0].label).toBe('"Test Query"');
    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalled();
  });

  it('creates chips for selected provinces', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, selectedProvinces: ['Ontario', 'Quebec'] },
      ...baseChipHandlers,
      onRemoveProvince: onRemove,
    });

    expect(chips).toHaveLength(2);
    expect(chips[0].id).toBe('p-Ontario');
    expect(chips[0].label).toBe('Ontario');
    expect(chips[1].id).toBe('p-Quebec');
    expect(chips[1].label).toBe('Quebec');

    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalledWith('Ontario');
  });

  it('creates chips for selected municipalities', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, selectedMunicipalities: ['Toronto', 'Montreal'] },
      ...baseChipHandlers,
      onRemoveMunicipality: onRemove,
    });

    expect(chips).toHaveLength(2);
    expect(chips[0].id).toBe('m-Toronto');
    expect(chips[0].label).toBe('Toronto');
    expect(chips[1].id).toBe('m-Montreal');
    expect(chips[1].label).toBe('Montreal');

    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalledWith('Toronto');
  });

  it('creates chips for selected organization types with translated labels', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, selectedTypes: ['nonprofit', 'government'] },
      ...baseChipHandlers,
      onRemoveType: onRemove,
    });

    expect(chips).toHaveLength(2);
    expect(chips[0].id).toBe('type-nonprofit');
    expect(chips[0].label).toBe('Non-Profit');
    expect(chips[1].id).toBe('type-government');
    expect(chips[1].label).toBe('Government');

    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalledWith('nonprofit');
  });

  it('creates chips for selected languages with translated labels', () => {
    const onRemove = vi.fn();
    const chips = buildOrgActiveFilterChips({
      filters: { ...baseFilters, selectedLanguages: ['en', 'fr'] },
      ...baseChipHandlers,
      onRemoveLanguage: onRemove,
    });

    expect(chips).toHaveLength(2);
    expect(chips[0].id).toBe('lang-en');
    expect(chips[0].label).toBe('English');
    expect(chips[1].id).toBe('lang-fr');
    expect(chips[1].label).toBe('French');

    chips[0]!.onRemove!();
    expect(onRemove).toHaveBeenCalledWith('en');
  });

  it('creates chips for all filter types combined', () => {
    const chips = buildOrgActiveFilterChips({
      filters: {
        searchQuery: 'test',
        showNonSse: true,
        selectedProvinces: ['Ontario'],
        selectedMunicipalities: ['Toronto'],
        selectedTypes: ['nonprofit'],
        selectedLanguages: ['bilingual'],
        selectedSectors: ['tech'],
        activityWindow: '90d',
      },
      ...baseChipHandlers,
    });

    expect(chips).toHaveLength(8);
    expect(chips[0].id).toBe('activity');
    expect(chips[1].id).toBe('nonSse');
    expect(chips[2].id).toBe('q');
    expect(chips[3].id).toBe('p-Ontario');
    expect(chips[4].id).toBe('m-Toronto');
    expect(chips[5].id).toBe('type-nonprofit');
    expect(chips[6].id).toBe('lang-bilingual');
    expect(chips[7].id).toBe('sector-tech');
  });
});

describe('toggleArrayItem', () => {
  it('adds an item when it is not in the array', () => {
    const result = toggleArrayItem('new', ['existing']);
    expect(result).toEqual(['existing', 'new']);
  });

  it('removes an item when it is in the array', () => {
    const result = toggleArrayItem('existing', ['existing', 'other']);
    expect(result).toEqual(['other']);
  });

  it('returns a new array instance', () => {
    const original = ['a', 'b'];
    const result = toggleArrayItem('c', original);
    expect(result).not.toBe(original);
  });

  it('handles empty array', () => {
    const result = toggleArrayItem('first', []);
    expect(result).toEqual(['first']);
  });

  it('works with different types', () => {
    const result = toggleArrayItem(42, [1, 2, 42, 3]);
    expect(result).toEqual([1, 2, 3]);
  });
});
