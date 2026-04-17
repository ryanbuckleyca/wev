import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { useMemo } from 'react';
import {
  JOB_SORT_OPTIONS,
  POSTED_WITHIN_FILTER_OPTIONS,
  type BulletinFilters,
} from '@/lib/bulletin/job-query';

export function useBulletinQueryState(
  initialProfileProvince: string[],
  initialProfileMunicipality: string[],
  initialProfileWorkTypes: string[]
) {
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [selectedOrganizations, setSelectedOrganizations] = useQueryState(
    'org',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedProvinces, setSelectedProvinces] = useQueryState(
    'province',
    parseAsArrayOf(parseAsString).withDefault(initialProfileProvince),
  );
  const [selectedMunicipalities, setSelectedMunicipalities] = useQueryState(
    'municipality',
    parseAsArrayOf(parseAsString).withDefault(initialProfileMunicipality),
  );
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useQueryState(
    'employment',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedSources, setSelectedSources] = useQueryState(
    'source',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [selectedWorkTypes, setSelectedWorkTypes] = useQueryState(
    'workType',
    parseAsArrayOf(parseAsString).withDefault(initialProfileWorkTypes),
  );
  const [showOnlySse, setShowOnlySse] = useQueryState('sse', parseAsBoolean.withDefault(true));
  const [showJobsWithoutSalary, setShowJobsWithoutSalary] = useQueryState(
    'salary',
    parseAsBoolean.withDefault(true),
  );
  const [postedWithin, setPostedWithin] = useQueryState(
    'posted',
    parseAsStringLiteral(POSTED_WITHIN_FILTER_OPTIONS).withDefault('2-weeks'),
  );
  const [currentPage, setCurrentPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringLiteral(JOB_SORT_OPTIONS).withDefault('date-desc'),
  );

  const filters = useMemo<BulletinFilters>(
    () => ({
      searchQuery,
      selectedOrganizations,
      selectedProvinces,
      selectedMunicipalities,
      selectedEmploymentTypes,
      selectedSources,
      selectedWorkTypes,
      showOnlySse,
      showJobsWithoutSalary,
      postedWithin,
    }),
    [
      searchQuery,
      selectedOrganizations,
      selectedProvinces,
      selectedMunicipalities,
      selectedEmploymentTypes,
      selectedSources,
      selectedWorkTypes,
      showOnlySse,
      showJobsWithoutSalary,
      postedWithin,
    ],
  );

  return {
    filters,
    state: {
      searchQuery,
      selectedOrganizations,
      selectedProvinces,
      selectedMunicipalities,
      selectedEmploymentTypes,
      selectedSources,
      selectedWorkTypes,
      showOnlySse,
      showJobsWithoutSalary,
      postedWithin,
      currentPage,
      sortBy,
    },
    setters: {
      setSearchQuery,
      setSelectedOrganizations,
      setSelectedProvinces,
      setSelectedMunicipalities,
      setSelectedEmploymentTypes,
      setSelectedSources,
      setSelectedWorkTypes,
      setShowOnlySse,
      setShowJobsWithoutSalary,
      setPostedWithin,
      setCurrentPage,
      setSortBy,
    },
  };
}
