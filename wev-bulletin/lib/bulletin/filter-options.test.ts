import { describe, expect, it } from 'vitest';
import type { JobPosting } from '@/lib/supabase';
import {
  buildFilterOptions,
  getAllMunicipalities,
  getIndeterminateProvinces,
  toggleMunicipalitySelection,
  toggleProvinceSelection,
} from './filter-options';

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    id: 'job-1',
    job_title: 'Community Organizer',
    organization: 'WEV',
    location: 'Ottawa, ON',
    municipality: 'Ottawa',
    province: 'Ontario',
    work_type: 'hybrid',
    date_posted: '2026-03-20T00:00:00',
    close_date: null,
    wage: '$25.00',
    listing_url: 'https://example.com/job',
    employment_type: 'Full-time',
    summary: 'Build community power.',
    is_sse: true,
    source: 'GoodWork',
    ...overrides,
  };
}

describe('bulletin filter option helpers', () => {
  it('builds sorted filter options from jobs', () => {
    const options = buildFilterOptions([
      makeJob({ organization: 'Zulu Org', province: 'Quebec', municipality: 'Montreal' }),
      makeJob({ organization: 'Alpha Org', province: 'Ontario', municipality: 'Ottawa' }),
      makeJob({ organization: 'Alpha Org', province: 'Ontario', municipality: 'Toronto' }),
    ]);

    expect(options.organizations).toEqual(['Alpha Org', 'Zulu Org']);
    expect(options.provinces).toEqual(['Ontario', 'Quebec']);
    expect(options.municipalitiesByProvince).toEqual({
      Ontario: ['Ottawa', 'Toronto'],
      Quebec: ['Montreal'],
    });
  });

  it('toggles province selection alongside its municipalities', () => {
    const selected = toggleProvinceSelection({
      province: 'Ontario',
      selectedProvinces: [],
      selectedMunicipalities: ['Montreal'],
      municipalitiesByProvince: {
        Ontario: ['Ottawa', 'Toronto'],
        Quebec: ['Montreal'],
      },
    });

    expect(selected).toEqual({
      provinces: ['Ontario'],
      municipalities: ['Montreal', 'Ottawa', 'Toronto'],
    });

    const deselected = toggleProvinceSelection({
      province: 'Ontario',
      selectedProvinces: selected.provinces,
      selectedMunicipalities: selected.municipalities,
      municipalitiesByProvince: {
        Ontario: ['Ottawa', 'Toronto'],
        Quebec: ['Montreal'],
      },
    });

    expect(deselected).toEqual({
      provinces: [],
      municipalities: ['Montreal'],
    });
  });

  it('derives all municipalities and indeterminate provinces', () => {
    const municipalitiesByProvince = {
      Ontario: ['Ottawa', 'Toronto'],
      Quebec: ['Montreal'],
    };

    expect(getAllMunicipalities(municipalitiesByProvince)).toEqual([
      'Montreal',
      'Ottawa',
      'Toronto',
    ]);

    expect(
      getIndeterminateProvinces({
        provinces: ['Ontario', 'Quebec'],
        municipalitiesByProvince,
        selectedMunicipalities: ['Ottawa'],
      }),
    ).toEqual(new Set(['Ontario']));

    expect(toggleMunicipalitySelection(['Ottawa'], 'Ottawa')).toEqual([]);
  });
});
