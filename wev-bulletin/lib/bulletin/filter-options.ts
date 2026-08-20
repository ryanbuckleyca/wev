import type { JobPosting } from '@/lib/supabase';
import { normalizeLocation } from './search-utils';

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
  // provinceKey -> preferredProvinceLabel
  const provinces = new Map<string, string>();
  // provinceKey -> Map<foldedMuniKey, preferredMuniLabel>
  const municipalitiesByProvince: Record<string, Map<string, string>> = {};
  const employmentTypes = new Set<string>();
  const sources = new Set<string>();
  const languages = new Set<string>();

  const isAscii = (s: string) => /^[\x00-\x7F]*$/.test(s);

  jobs.forEach((job) => {
    if (job.organization) organizations.add(job.organization);
    if (job.source) sources.add(job.source);
    if (job.employment_type) employmentTypes.add(job.employment_type);
    if (job.language) languages.add(job.language);

    if (!job.province) return;

    const provLabel = job.province.trim();
    const provKey = normalizeLocation(provLabel);

    const existingProv = provinces.get(provKey);
    if (!existingProv || (isAscii(provLabel) && !isAscii(existingProv))) {
      provinces.set(provKey, provLabel);
    }

    if (!municipalitiesByProvince[provKey]) {
      municipalitiesByProvince[provKey] = new Map<string, string>();
    }

    if (job.municipality) {
      const muniLabel = job.municipality.trim();
      const muniKey = normalizeLocation(muniLabel);
      const existingMuni = municipalitiesByProvince[provKey].get(muniKey);

      if (!existingMuni || (isAscii(muniLabel) && !isAscii(existingMuni))) {
        municipalitiesByProvince[provKey].set(muniKey, muniLabel);
      }
    }
  });

  const sortedMunicipalitiesByProvince: MunicipalitiesByProvince = {};
  const sortedProvKeys = Array.from(provinces.keys()).sort((a, b) =>
    provinces.get(a)!.localeCompare(provinces.get(b)!),
  );

  sortedProvKeys.forEach((provKey) => {
    const provLabel = provinces.get(provKey)!;
    sortedMunicipalitiesByProvince[provLabel] = Array.from(
      municipalitiesByProvince[provKey].values(),
    ).sort();
  });

  return {
    organizations: Array.from(organizations).sort(),
    provinces: Array.from(provinces.values()).sort(),
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
