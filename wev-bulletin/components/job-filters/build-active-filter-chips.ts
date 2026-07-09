import type { ActiveFilterChip } from '@/components/JobSearch';
import { getJobLanguageLabel, getWorkTypeLabel } from '@/lib/bulletin/filter-labels';
import { truncateMiddle } from '@/lib/string-utils';
import { postedWithinChipOptions, type PostedWithinValue } from './posted-within-options';

const MAX_TAG_LENGTH = 20;

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

export type ActiveFilterChipInputs = {
  postedWithin: PostedWithinValue;
  showNonSse: boolean;
  showJobsWithoutSalary: boolean;
  searchQuery: string;
  selectedWorkTypes: string[];
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedOrganizations: string[];
  selectedEmploymentTypes: string[];
  selectedSources: string[];
  selectedLanguages: string[];
  onPostedWithinChange: (value: PostedWithinValue) => void;
  onShowNonSseChange: (value: boolean) => void;
  onShowJobsWithoutSalaryChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onWorkTypesChange: (value: string[]) => void;
  onProvincesChange: (value: string[]) => void;
  onMunicipalitiesChange: (value: string[]) => void;
  onOrganizationsChange: (value: string[]) => void;
  onEmploymentTypesChange: (value: string[]) => void;
  onSourcesChange: (value: string[]) => void;
  onLanguagesChange: (value: string[]) => void;
};

function buildSelectionChips(
  keyPrefix: string,
  items: string[],
  labelForItem: (item: string) => string,
  onRemoveItem: (item: string) => void,
): ActiveFilterChip[] {
  return items.map((item) => {
    const fullLabel = labelForItem(item);

    return {
      id: `${keyPrefix}-${item}`,
      label: truncateMiddle(fullLabel, MAX_TAG_LENGTH),
      title: fullLabel,
      onRemove: () => onRemoveItem(item),
    };
  });
}

function getTranslationOrFallback(t: TranslateFn, key: string, fallback: string): string {
  const translation = t(key);
  return translation === key ? fallback : translation;
}

export function buildActiveFilterChips(
  input: ActiveFilterChipInputs,
  t: TranslateFn,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (input.postedWithin !== 'any') {
    const option = postedWithinChipOptions[input.postedWithin];
    const fullLabel = `${t('filters.chips.posted')} ${t(option.fullKey)}`;
    const shortLabel = getTranslationOrFallback(t, option.shortKey, option.fallbackShort);

    chips.push({
      id: 'posted-within',
      label: shortLabel,
      title: fullLabel,
      onRemove: () => input.onPostedWithinChange('any'),
    });
  }

  // showNonSse=true means user opted into seeing non-SSE jobs — show a chip so they can remove it
  if (input.showNonSse) {
    chips.push({
      id: 'nonSse',
      label: getTranslationOrFallback(t, 'filters.chips.allJobs', 'All jobs'),
      title: t('filters.chips.allJobs'),
      onRemove: () => input.onShowNonSseChange(false),
    });
  }

  if (!input.showJobsWithoutSalary) {
    chips.push({
      id: 'salary',
      label: t('filters.chips.salaryListedOnly'),
      onRemove: () => input.onShowJobsWithoutSalaryChange(true),
    });
  }

  if (input.searchQuery) {
    const truncated =
      input.searchQuery.length > 24 ? `${input.searchQuery.slice(0, 24)}…` : input.searchQuery;
    chips.push({
      id: 'search',
      label: `"${truncated}"`,
      title: `${t('filters.chips.search')} "${input.searchQuery}"`,
      onRemove: () => input.onSearchChange(''),
    });
  }

  chips.push(
    ...buildSelectionChips(
      'work-type',
      input.selectedWorkTypes,
      (workType) => getWorkTypeLabel(workType, t),
      (workType) =>
        input.onWorkTypesChange(input.selectedWorkTypes.filter((item) => item !== workType)),
    ),
  );

  chips.push(
    ...buildSelectionChips(
      'province',
      input.selectedProvinces,
      (province) => province,
      (province) =>
        input.onProvincesChange(input.selectedProvinces.filter((item) => item !== province)),
    ),
  );

  chips.push(
    ...buildSelectionChips(
      'municipality',
      input.selectedMunicipalities,
      (municipality) => municipality,
      (municipality) =>
        input.onMunicipalitiesChange(
          input.selectedMunicipalities.filter((item) => item !== municipality),
        ),
    ),
  );

  chips.push(
    ...buildSelectionChips(
      'organization',
      input.selectedOrganizations,
      (organization) => organization,
      (organization) =>
        input.onOrganizationsChange(
          input.selectedOrganizations.filter((item) => item !== organization),
        ),
    ),
  );

  chips.push(
    ...buildSelectionChips(
      'employment-type',
      input.selectedEmploymentTypes,
      (employmentType) => employmentType,
      (employmentType) =>
        input.onEmploymentTypesChange(
          input.selectedEmploymentTypes.filter((item) => item !== employmentType),
        ),
    ),
  );

  chips.push(
    ...buildSelectionChips(
      'source',
      input.selectedSources,
      (source) => source,
      (source) => input.onSourcesChange(input.selectedSources.filter((item) => item !== source)),
    ),
  );

  chips.push(
    ...buildSelectionChips(
      'language',
      input.selectedLanguages,
      (lang) => getJobLanguageLabel(lang, t),
      (lang) => input.onLanguagesChange(input.selectedLanguages.filter((item) => item !== lang)),
    ),
  );

  return chips;
}
