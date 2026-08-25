/**
 * Builds the ActiveFilterChip array for the organization index filters.
 * Kept separate from build-active-filter-chips.ts (bulletin/job filters) so
 * each can evolve independently and both remain unit-testable in isolation.
 */

import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import type { OrganizationFilters } from '@/lib/hooks/useOrganizationFilters';
import type { ActiveFilterChip } from '@/components/JobSearch';

interface BuildOrgFilterChipsInput {
  filters: OrganizationFilters;
  onRemoveActivity: () => void;
  onRemoveNonSse: () => void;
  onRemoveSearch: () => void;
  onRemoveProvince: (province: string) => void;
  onRemoveMunicipality: (municipality: string) => void;
  onRemoveType: (type: string) => void;
  onRemoveLanguage: (language: string) => void;
  onRemoveSector: (sector: string) => void;
  /** next-intl t function scoped to the 'organizations' namespace */
  tOrgs: { (key: string): string; has: (key: string) => boolean };
  /** next-intl t function scoped to the 'filters' namespace */
  tFilters: (key: string) => string;
  /** next-intl t function scoped to the 'taxonomy.sectors' namespace */
  tSectors: (key: string) => string;
}

/** Labels for org language chips/filters; tFilters is scoped to `filters`. */
export function orgLanguageLabel(language: string, tFilters: (key: string) => string): string {
  if (language === 'en') return tFilters('language.en');
  if (language === 'fr') return tFilters('language.fr');
  if (language === 'bilingual') return tFilters('language.bilingual');
  return language;
}

export function buildOrgActiveFilterChips({
  filters,
  onRemoveActivity,
  onRemoveNonSse,
  onRemoveSearch,
  onRemoveProvince,
  onRemoveMunicipality,
  onRemoveType,
  onRemoveLanguage,
  onRemoveSector,
  tOrgs,
  tFilters,
  tSectors,
}: BuildOrgFilterChipsInput): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.activityWindow !== 'all') {
    chips.push({
      id: 'activity',
      label: tOrgs(`activity${filters.activityWindow}`),
      onRemove: onRemoveActivity,
    });
  }

  if (filters.showNonSse) {
    chips.push({
      id: 'nonSse',
      label: tFilters('chips.allOrgs'),
      title: tFilters('chips.allOrgs'),
      onRemove: onRemoveNonSse,
    });
  }

  if (filters.searchQuery) {
    chips.push({
      id: 'q',
      label: `"${filters.searchQuery}"`,
      onRemove: onRemoveSearch,
    });
  }

  for (const province of filters.selectedProvinces) {
    chips.push({
      id: `p-${province}`,
      label: province,
      onRemove: () => onRemoveProvince(province),
    });
  }

  for (const municipality of filters.selectedMunicipalities) {
    chips.push({
      id: `m-${municipality}`,
      label: municipality,
      onRemove: () => onRemoveMunicipality(municipality),
    });
  }

  for (const type of filters.selectedTypes) {
    chips.push({
      id: `type-${type}`,
      label: getOrganizationTypeLabel(type, tOrgs) ?? type,
      onRemove: () => onRemoveType(type),
    });
  }

  for (const language of filters.selectedLanguages) {
    chips.push({
      id: `lang-${language}`,
      label: orgLanguageLabel(language, tFilters),
      onRemove: () => onRemoveLanguage(language),
    });
  }

  for (const sector of filters.selectedSectors) {
    chips.push({
      id: `sector-${sector}`,
      label: tSectors(`${sector}.label`),
      onRemove: () => onRemoveSector(sector),
    });
  }

  return chips;
}

/**
 * Toggles an item in/out of an array.
 * Pure utility; extracted here so OrganizationFilters and any future consumers
 * don't each define their own inline version.
 */
export function toggleArrayItem<T>(item: T, current: T[]): T[] {
  return current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
}
