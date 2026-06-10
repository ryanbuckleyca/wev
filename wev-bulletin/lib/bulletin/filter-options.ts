import type { JobPosting } from '@/lib/supabase';

export type MunicipalitiesByProvince = Record<string, string[]>;

export type BulletinFilterOptions = {
  organizations: string[];
  provinces: string[];
  municipalitiesByProvince: MunicipalitiesByProvince;
  employmentTypes: string[];
  sources: string[];
  languages: string[];
};

export function toggleSelection(items: string[], value: string): string[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function buildFilterOptions(jobs: JobPosting[]): BulletinFilterOptions {
  const organizations = new Set<string>();
  const provinces = new Set<string>();
  const municipalitiesByProvince: Record<string, Set<string>> = {};
  const employmentTypes = new Set<string>();
  const sources = new Set<string>();
  const languages = new Set<string>();

  jobs.forEach((job) => {
    if (job.organization) organizations.add(job.organization);
    if (job.source) sources.add(job.source);
    if (job.employment_type) employmentTypes.add(job.employment_type);
    if (job.language) languages.add(job.language);

    if (!job.province) return;
    provinces.add(job.province);

    if (!municipalitiesByProvince[job.province]) {
      municipalitiesByProvince[job.province] = new Set<string>();
    }

    if (job.municipality) {
      municipalitiesByProvince[job.province].add(job.municipality);
    }
  });

  const sortedMunicipalitiesByProvince: MunicipalitiesByProvince = {};
  Object.keys(municipalitiesByProvince)
    .sort()
    .forEach((province) => {
      sortedMunicipalitiesByProvince[province] = Array.from(
        municipalitiesByProvince[province],
      ).sort();
    });

  return {
    organizations: Array.from(organizations).sort(),
    provinces: Array.from(provinces).sort(),
    municipalitiesByProvince: sortedMunicipalitiesByProvince,
    employmentTypes: Array.from(employmentTypes).sort(),
    sources: Array.from(sources).sort(),
    languages: Array.from(languages).sort(),
  };
}

export function toggleProvinceSelection({
  province,
  selectedProvinces,
  selectedMunicipalities,
  municipalitiesByProvince,
}: {
  province: string;
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  municipalitiesByProvince: MunicipalitiesByProvince;
}): { provinces: string[]; municipalities: string[] } {
  const municipalitiesInProvince = municipalitiesByProvince[province] ?? [];

  if (selectedProvinces.includes(province)) {
    return {
      provinces: selectedProvinces.filter((item) => item !== province),
      municipalities: selectedMunicipalities.filter(
        (municipality) => !municipalitiesInProvince.includes(municipality),
      ),
    };
  }

  return {
    provinces: [...selectedProvinces, province],
    municipalities: Array.from(new Set([...selectedMunicipalities, ...municipalitiesInProvince])),
  };
}

export function toggleMunicipalitySelection(
  selectedMunicipalities: string[],
  municipality: string,
): string[] {
  return toggleSelection(selectedMunicipalities, municipality);
}

export function getVisibleMunicipalitiesByProvince({
  municipalitiesByProvince,
  selectedProvinces,
  selectedMunicipalities,
}: {
  municipalitiesByProvince: MunicipalitiesByProvince;
  selectedProvinces: string[];
  selectedMunicipalities: string[];
}): MunicipalitiesByProvince {
  const visible: MunicipalitiesByProvince = {};

  Object.entries(municipalitiesByProvince).forEach(([province, municipalities]) => {
    const hasSelectedMunicipality = municipalities.some((municipality) =>
      selectedMunicipalities.includes(municipality),
    );
    const shouldShow =
      selectedProvinces.length === 0 ||
      selectedProvinces.includes(province) ||
      hasSelectedMunicipality;

    if (shouldShow) {
      visible[province] = municipalities;
    }
  });

  return visible;
}

export function getAllMunicipalities(municipalitiesByProvince: MunicipalitiesByProvince): string[] {
  return Object.values(municipalitiesByProvince).flat().sort();
}

export function getIndeterminateProvinces({
  provinces,
  municipalitiesByProvince,
  selectedMunicipalities,
}: {
  provinces: string[];
  municipalitiesByProvince: MunicipalitiesByProvince;
  selectedMunicipalities: string[];
}): Set<string> {
  const indeterminate = new Set<string>();

  provinces.forEach((province) => {
    const municipalities = municipalitiesByProvince[province] ?? [];
    if (municipalities.length === 0) return;

    const selectedCount = municipalities.filter((municipality) =>
      selectedMunicipalities.includes(municipality),
    ).length;

    if (selectedCount > 0 && selectedCount < municipalities.length) {
      indeterminate.add(province);
    }
  });

  return indeterminate;
}
