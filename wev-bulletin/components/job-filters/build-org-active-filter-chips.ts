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
  onRemoveNonSse: () => void;
  onRemoveSearch: () => void;
  onRemoveProvince: (province: string) => void;
  onRemoveMunicipality: (municipality: string) => void;
  onRemoveType: (type: string) => void;
  /** next-intl t function scoped to the 'organizations' namespace */
  tOrgs: { (key: string): string; has: (key: string) => boolean };
  /** next-intl t function scoped to the 'filters' namespace */
  tFilters: (key: string) => string;
}

export function buildOrgActiveFilterChips({
  filters,
  onRemoveNonSse,
  onRemoveSearch,
  onRemoveProvince,
  onRemoveMunicipality,
  onRemoveType,
  tOrgs,
  tFilters,
}: BuildOrgFilterChipsInput): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

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
