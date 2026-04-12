import type { Json, TableInsert } from './database.types';

export const SEEDED_JOB_BOARD_EXPECTATIONS = {
  employmentTypeCounts: {
    contract: 12,
    fullTime: 13,
  },
  firstPageCount: 20,
  jobCount: 25,
  municipalityCounts: {
    montreal: 4,
    ottawa: 4,
    quebecCity: 4,
    toronto: 4,
  },
  oneWeekCount: 15,
  organizationCounts: {
    partner1: 7,
  },
  provinceCounts: {
    on: 8,
    qc: 8,
  },
  salaryListedCount: 22,
  sampleJobs: {
    nonSseOnly: 'Community Builder 26',
    searchMatch: 'Community Builder 25',
    salarylessVisible: 'Community Builder 4',
  },
  secondPageCount: 5,
  sourceCounts: {
    csi: 4,
    goodwork: 4,
    ecocanada: 4,
    centraide: 4,
    coco: 4,
    ma_communaute_emplois: 4,
    ma_communaute_bene: 3,
  },
  sseOffCount: 27,
  workTypeCounts: {
    hybrid: 8,
    office: 8,
    remote: 9,
  },
} as const;

type BookmarkInsert = TableInsert<'bookmarks'>;
type JobInsert = TableInsert<'jobs'>;
type JobMatchInsert = TableInsert<'job_matches'>;
type ProfileInsert = TableInsert<'profiles'>;
type ScrapeRunInsert = TableInsert<'scrape_runs'>;
export type SourceInsert = TableInsert<'sources'>;
type UserRoleInsert = TableInsert<'user_roles'>;

export type SeedTables = {
  bookmarks: BookmarkInsert[];
  jobMatches: JobMatchInsert[];
  jobs: JobInsert[];
  profiles: ProfileInsert[];
  scrapeRuns: ScrapeRunInsert[];
  sources: SourceInsert[];
  userRoles: UserRoleInsert[];
};

export type SeedDataset = {
  tables: SeedTables;
};

const SCRAPE_RUN_ID = buildUuid(9_000);
const TOTAL_SEEDED_JOB_COUNT = 27;
const SALARYLESS_JOB_INDEXES = new Set([3, 11, 19]);

function buildUuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}

function toIsoTimestamp(date: Date): string {
  return date.toISOString();
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function createSourceFixtures(now: Date): SourceInsert[] {
  return [
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 30)),
      id: buildUuid(1),
      name: 'Local Source A',
      url: 'https://example.com/source-a',
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 29)),
      id: buildUuid(2),
      name: 'Local Source B',
      url: 'https://example.com/source-b',
    },
  ];
}

function createJobValues(index: number): string[] {
  const valueSets = [
    ['Help Society', 'Moral Fulfillment'],
    ['Work Life Balance', 'Creativity'],
    ['Autonomy', 'Learning'],
  ] as const;

  return [...valueSets[index % valueSets.length]];
}

function createRatedValues(values: string[]): Json {
  return values.map((value, index) => ({
    confidence: index + 1,
    value,
  }));
}

function createSkillUris(index: number): string[] {
  return [
    `http://data.europa.eu/esco/skill/wev-skill-${index + 1}`,
    `http://data.europa.eu/esco/skill/wev-skill-shared-${(index % 3) + 1}`,
  ];
}

type JobLocation = Pick<
  JobInsert,
  'geocode_accuracy_type' | 'is_remote' | 'lat' | 'lng' | 'location' | 'municipality' | 'province'
>;

type JobSalary = Pick<
  JobInsert,
  'compensation_meta' | 'max_value' | 'min_value' | 'unit_text' | 'wage'
>;

function createJobLocation(index: number, workType: JobInsert['work_type']): JobLocation {
  if (workType === 'remote') {
    return {
      geocode_accuracy_type: null,
      is_remote: true,
      lat: null,
      lng: null,
      location: 'Remote, Canada',
      municipality: null,
      province: null,
    };
  }

  const isOntario = index % 2 === 0;
  if (isOntario) {
    const isToronto = index % 4 === 0;
    return {
      geocode_accuracy_type: 'city',
      is_remote: false,
      lat: isToronto ? 43.6532 : 45.4215,
      lng: isToronto ? -79.3832 : -75.6972,
      location: isToronto ? 'Toronto, ON' : 'Ottawa, ON',
      municipality: isToronto ? 'Toronto' : 'Ottawa',
      province: 'ON',
    };
  }

  const isMontreal = index % 4 === 1;
  return {
    geocode_accuracy_type: 'city',
    is_remote: false,
    lat: isMontreal ? 45.5017 : 46.8139,
    lng: isMontreal ? -73.5673 : -71.208,
    location: isMontreal ? 'Montreal, QC' : 'Quebec City, QC',
    municipality: isMontreal ? 'Montreal' : 'Quebec City',
    province: 'QC',
  };
}

function createJobSalary(index: number): JobSalary {
  const hasSalary = !SALARYLESS_JOB_INDEXES.has(index);
  const salaryFloor = 55_000 + index * 1_000;

  if (!hasSalary) {
    return {
      compensation_meta: null,
      max_value: null,
      min_value: null,
      unit_text: null,
      wage: null,
    };
  }

  return {
    compensation_meta: {
      confidence: 0.8,
      currency: 'CAD',
      raw: `$${salaryFloor.toLocaleString()}`,
    },
    max_value: salaryFloor + 8_000,
    min_value: salaryFloor,
    unit_text: 'YEAR',
    wage: `$${salaryFloor.toLocaleString()} CAD`,
  };
}

function createJobFixture(index: number, now: Date, sourceIds: string[]): JobInsert {
  const workType = (['remote', 'hybrid', 'office'] as const)[index % 3];
  const sourceId = sourceIds[index % sourceIds.length];
  const values = createJobValues(index);
  const datePosted = daysAgo(now, index % 12);
  const scrapedAt = hoursAgo(now, index);
  const location = createJobLocation(index, workType);
  const salary = createJobSalary(index);

  return {
    close_date: null,
    compensation_meta: salary.compensation_meta,
    date_posted: toIsoDate(datePosted),
    description: `Owned e2e fixture for role ${index + 1}.`,
    employment_type: index % 2 === 0 ? 'full-time' : 'contract',
    extra: {},
    geocode_accuracy_type: location.geocode_accuracy_type,
    hours_per_week: 35,
    id: buildUuid(1_000 + index),
    is_remote: location.is_remote,
    // The bulletin defaults to the SSE-only filter, so the first 25 rows shape
    // the default landing state and the final 2 rows exercise that toggle.
    is_sse: index < SEEDED_JOB_BOARD_EXPECTATIONS.jobCount,
    job_title: `Community Builder ${index + 1}`,
    language: index % 5 === 0 ? 'fr' : 'en',
    lat: location.lat,
    listing_url: `https://wev.example/jobs/${index + 1}`,
    lng: location.lng,
    location: location.location,
    max_value: salary.max_value,
    min_value: salary.min_value,
    municipality: location.municipality,
    organization: `WEV Partner ${((index % 4) + 1).toString()}`,
    province: location.province,
    scraped_at: toIsoTimestamp(scrapedAt),
    source_id: sourceId,
    sse_details: null,
    sse_rating: null,
    skills: createSkillUris(index),
    summary: `Deterministic bulletin seed item ${index + 1}.`,
    unit_text: salary.unit_text,
    values,
    values_rated: createRatedValues(values),
    wage: salary.wage,
    work_type: workType,
  };
}

function createJobFixtures(jobCount: number, now: Date, sourceIds: string[]): JobInsert[] {
  return Array.from({ length: jobCount }, (_, index) => createJobFixture(index, now, sourceIds));
}

function createScrapeRunFixture(now: Date, sourceId: string, jobCount: number): ScrapeRunInsert[] {
  return [
    {
      ended_at: toIsoTimestamp(now),
      errors: null,
      id: SCRAPE_RUN_ID,
      jobs_added: jobCount,
      jobs_found: jobCount,
      run_at: toIsoTimestamp(now),
      source_id: sourceId,
      sources_with_errors: 0,
      started_at: toIsoTimestamp(hoursAgo(now, 1)),
      status: 'completed',
      total_jobs_found: jobCount,
      total_jobs_inserted: jobCount,
      total_sources: 3,
    },
  ];
}

function emptySeedTables(): SeedTables {
  return {
    bookmarks: [],
    jobMatches: [],
    jobs: [],
    profiles: [],
    scrapeRuns: [],
    sources: [],
    userRoles: [],
  };
}

export function createSeedDataset(
  now: Date = new Date(),
  sourceOverrides?: SourceInsert[],
): SeedDataset {
  const sources = sourceOverrides || createSourceFixtures(now);
  const sourceIds = sources.map((s) => s.id);
  const jobs = createJobFixtures(TOTAL_SEEDED_JOB_COUNT, now, sourceIds);

  return {
    tables: {
      ...emptySeedTables(),
      jobs,
      scrapeRuns: createScrapeRunFixture(now, sourceIds[0], jobs.length),
      sources,
    },
  };
}
