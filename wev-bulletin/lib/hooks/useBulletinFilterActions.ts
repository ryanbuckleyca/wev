import { useCallback } from 'react';
import type { WorkType } from '@/lib/work-types';
import type { PostedWithinSelection } from '@/lib/bulletin/job-query';

export function useBulletinFilterActions(
  setters: {
    setSearchQuery: (val: string) => Promise<unknown> | void;
    setSelectedOrganizations: (val: string[]) => Promise<unknown> | void;
    setSelectedProvinces: (val: string[]) => Promise<unknown> | void;
    setSelectedMunicipalities: (val: string[]) => Promise<unknown> | void;
    setSelectedEmploymentTypes: (val: string[]) => Promise<unknown> | void;
    setSelectedSources: (val: string[]) => Promise<unknown> | void;
    setSelectedWorkTypes: (val: string[]) => Promise<unknown> | void;
    setShowOnlySse: (val: boolean) => Promise<unknown> | void;
    setShowJobsWithoutSalary: (val: boolean) => Promise<unknown> | void;
    setPostedWithin: (val: PostedWithinSelection) => Promise<unknown> | void;
  },
  profileContext: {
    profileWorkTypes: WorkType[];
    profileMunicipality: string | null;
    profileProvince: string | null;
  }
) {
  const {
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
  } = setters;

  const { profileWorkTypes, profileMunicipality, profileProvince } = profileContext;

  const resetCommonFilters = useCallback(() => {
    void setSearchQuery('');
    void setSelectedOrganizations([]);
    void setSelectedProvinces([]);
    void setSelectedMunicipalities([]);
    void setSelectedEmploymentTypes([]);
    void setSelectedSources([]);
  }, [
    setSearchQuery,
    setSelectedOrganizations,
    setSelectedProvinces,
    setSelectedMunicipalities,
    setSelectedEmploymentTypes,
    setSelectedSources,
  ]);

  const clearAllFilters = useCallback(() => {
    resetCommonFilters();
    void setSelectedWorkTypes([]);
    void setShowOnlySse(false);
    void setShowJobsWithoutSalary(true);
    void setPostedWithin('any');
  }, [resetCommonFilters, setSelectedWorkTypes, setShowOnlySse, setShowJobsWithoutSalary, setPostedWithin]);

  const applySuggestedDefaults = useCallback(() => {
    resetCommonFilters();
    void setSelectedWorkTypes(profileWorkTypes);
    void setShowOnlySse(true);
    void setShowJobsWithoutSalary(true);
    void setPostedWithin('2-weeks');
  }, [resetCommonFilters, profileWorkTypes, setSelectedWorkTypes, setShowOnlySse, setShowJobsWithoutSalary, setPostedWithin]);

  const handleResetToProfileWorkTypes = useCallback(() => {
    if (profileWorkTypes.length === 0) return;
    void setSelectedWorkTypes(profileWorkTypes);
  }, [profileWorkTypes, setSelectedWorkTypes]);

  const handleResetToProfileLocation = useCallback(() => {
    if (!profileMunicipality || !profileProvince) return;
    void setSelectedProvinces([profileProvince]);
    void setSelectedMunicipalities([profileMunicipality]);
  }, [profileMunicipality, profileProvince, setSelectedProvinces, setSelectedMunicipalities]);

  return {
    clearAllFilters,
    applySuggestedDefaults,
    handleResetToProfileWorkTypes,
    handleResetToProfileLocation,
  };
}
