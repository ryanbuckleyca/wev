import type { PostedWithinSelection } from '@/lib/bulletin/job-query';
import type { JobPosting } from '@/lib/supabase';
import type { WorkType } from '@/lib/work-types';

export interface JobFiltersProps {
  jobs: JobPosting[];
  filteredJobsCount?: number;
  totalJobsCount?: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedOrganizations: string[];
  onOrganizationsChange: (organizations: string[]) => void;
  selectedProvinces: string[];
  onProvincesChange: (provinces: string[]) => void;
  selectedMunicipalities: string[];
  onMunicipalitiesChange: (municipalities: string[]) => void;
  selectedEmploymentTypes: string[];
  onEmploymentTypesChange: (employmentTypes: string[]) => void;
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  selectedWorkTypes: string[];
  onWorkTypesChange: (workTypes: string[]) => void;
  showOnlySse: boolean;
  onShowOnlySseChange: (showOnlySse: boolean) => void;
  showJobsWithoutSalary: boolean;
  onShowJobsWithoutSalaryChange: (showJobsWithoutSalary: boolean) => void;
  postedWithin: PostedWithinSelection;
  onPostedWithinChange: (postedWithin: PostedWithinSelection) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  profileWorkTypes?: WorkType[];
  isUsingProfileWorkTypes?: boolean;
  onResetToProfileWorkTypes?: () => void;
  profileMunicipality?: string | null;
  profileProvince?: string | null;
  isUsingProfileLocation?: boolean;
  onResetToProfileLocation?: () => void;
}
