import type { Json, TableInsert } from "./database.types";

// E2E dynamic test constraints resolved below.

type BookmarkInsert = TableInsert<"bookmarks">;
type JobInsert = TableInsert<"jobs">;
type JobMatchInsert = TableInsert<"job_matches">;
type ProfileInsert = TableInsert<"profiles">;
type ScrapeRunInsert = TableInsert<"scrape_runs">;
export type SourceInsert = TableInsert<"sources">;
type UserRoleInsert = TableInsert<"user_roles">;

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
const TOTAL_SSE_JOB_COUNT = 25;
const SALARYLESS_JOB_INDEXES = new Set([3, 11, 19]);

function buildUuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
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
      name: "Centre for Social Innovation",
      url: "https://socialinnovation.org",
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 29)),
      id: buildUuid(2),
      name: "GoodWork",
      url: "https://goodwork.ca",
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 28)),
      id: buildUuid(3),
      name: "ECO Canada",
      url: "https://eco.ca/jobs",
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 27)),
      id: buildUuid(4),
      name: "Centraide",
      url: "https://centraide.ca",
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 26)),
      id: buildUuid(5),
      name: "COCO",
      url: "https://coco.ca",
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 25)),
      id: buildUuid(6),
      name: "Ma Communauté Emplois",
      url: "https://macommunaute.ca/emplois",
    },
    {
      active: true,
      created_at: toIsoTimestamp(daysAgo(now, 24)),
      id: buildUuid(7),
      name: "Ma Communauté Bénévolat",
      url: "https://macommunaute.ca/benevolat",
    },
  ];
}

function createJobValues(index: number): string[] {
  const valueSets = [
    ["Help Society", "Moral Fulfillment"],
    ["Work-Life Balance", "Creativity"],
    ["Independence", "Challenge"],
    ["Financial Gain", "Decision Making"],
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
  // Use real ESCO URIs corresponding to common skills in the seeded index
  const realSkills = [
    "http://data.europa.eu/esco/skill/97965983-0da4-4902-9daf-d5cd2693ef73", // 3D modelling
    "http://data.europa.eu/esco/skill/6bc02a4a-66af-4b49-9bd3-d07695d52b42", // abide by business ethical code of conducts
    "http://data.europa.eu/esco/skill/eb0e5615-1575-4a86-a1a2-7d39595033c5", // ABAP
    "http://data.europa.eu/esco/skill/27247d7e-d327-4ba2-87fe-215143be6453", // abrasive blasting processes
  ];

  return [
    realSkills[index % realSkills.length],
    realSkills[(index + 1) % realSkills.length],
  ];
}

type JobLocation = Pick<
  JobInsert,
  | "geocode_accuracy_type"
  | "is_remote"
  | "lat"
  | "lng"
  | "location"
  | "municipality"
  | "province"
>;

type JobSalary = Pick<
  JobInsert,
  "compensation_meta" | "max_value" | "min_value" | "unit_text" | "wage"
>;

function createJobLocation(
  index: number,
  workType: JobInsert["work_type"],
): JobLocation {
  if (workType === "remote") {
    return {
      geocode_accuracy_type: null,
      is_remote: true,
      lat: null,
      lng: null,
      location: "Remote, Canada",
      municipality: null,
      province: null,
    };
  }

  const isOntario = index % 2 === 0;
  if (isOntario) {
    const isToronto = index % 4 === 0;
    return {
      geocode_accuracy_type: "city",
      is_remote: false,
      lat: isToronto ? 43.6532 : 45.4215,
      lng: isToronto ? -79.3832 : -75.6972,
      location: isToronto ? "Toronto, ON" : "Ottawa, ON",
      municipality: isToronto ? "Toronto" : "Ottawa",
      province: "ON",
    };
  }

  const isMontreal = index % 4 === 1;
  return {
    geocode_accuracy_type: "city",
    is_remote: false,
    lat: isMontreal ? 45.5017 : 46.8139,
    lng: isMontreal ? -73.5673 : -71.208,
    location: isMontreal ? "Montreal, QC" : "Quebec City, QC",
    municipality: isMontreal ? "Montreal" : "Quebec City",
    province: "QC",
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
      currency: "CAD",
      raw: `$${salaryFloor.toLocaleString()}`,
    },
    max_value: salaryFloor + 8_000,
    min_value: salaryFloor,
    unit_text: "YEAR",
    wage: `$${salaryFloor.toLocaleString()} CAD`,
  };
}

function createJobFixture(
  index: number,
  now: Date,
  sourceIds: string[],
): JobInsert {
  const workType = (["remote", "hybrid", "office"] as const)[index % 3];
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
    employment_type: index % 2 === 0 ? "full-time" : "contract",
    extra: {},
    geocode_accuracy_type: location.geocode_accuracy_type,
    hours_per_week: 35,
    id: buildUuid(1_000 + index),
    is_remote: location.is_remote,
    // The bulletin defaults to the SSE-only filter, so the first 25 rows shape
    // the default landing state and the final 2 rows exercise that toggle.
    is_sse: index < TOTAL_SSE_JOB_COUNT,
    job_title: `Community Builder ${index + 1}`,
    language: index % 5 === 0 ? "fr" : "en",
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

function createJobFixtures(
  jobCount: number,
  now: Date,
  sourceIds: string[],
): JobInsert[] {
  return Array.from({ length: jobCount }, (_, index) =>
    createJobFixture(index, now, sourceIds),
  );
}

function createScrapeRunFixture(
  now: Date,
  sourceId: string,
  jobCount: number,
): ScrapeRunInsert[] {
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
      status: "completed",
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

// Compute deterministic test expectations directly across generated values rather than hardcoding.
export const SEEDED_JOB_BOARD_EXPECTATIONS = (() => {
  const mockNow = new Date(0);
  const sources = createSourceFixtures(mockNow);
  const sourceIds = sources.map((s) => s.id);
  const jobs = createJobFixtures(TOTAL_SEEDED_JOB_COUNT, mockNow, sourceIds);
  const sseJobs = jobs.filter((j) => j.is_sse);

  const employmentTypeCounts = { contract: 0, fullTime: 0 };
  const municipalityCounts = {
    montreal: 0,
    ottawa: 0,
    quebecCity: 0,
    toronto: 0,
  };
  const organizationCounts = { partner1: 0 };
  const provinceCounts = { on: 0, qc: 0 };
  const sourceCounts = {
    csi: 0,
    goodwork: 0,
    ecocanada: 0,
    centraide: 0,
    coco: 0,
    ma_communaute_emplois: 0,
    ma_communaute_bene: 0,
  };
  const workTypeCounts = { hybrid: 0, office: 0, remote: 0 };
  let salaryListedCount = 0;
  let oneWeekCount = 0;

  const sourceKeyMap = [
    "csi",
    "goodwork",
    "ecocanada",
    "centraide",
    "coco",
    "ma_communaute_emplois",
    "ma_communaute_bene",
  ] as const;

  for (let index = 0; index < sseJobs.length; index++) {
    const job = sseJobs[index];
    if (job.employment_type === "contract") employmentTypeCounts.contract++;
    if (job.employment_type === "full-time") employmentTypeCounts.fullTime++;

    if (job.municipality === "Montreal") municipalityCounts.montreal++;
    if (job.municipality === "Ottawa") municipalityCounts.ottawa++;
    if (job.municipality === "Quebec City") municipalityCounts.quebecCity++;
    if (job.municipality === "Toronto") municipalityCounts.toronto++;

    if (job.organization === "WEV Partner 1") organizationCounts.partner1++;

    if (!job.is_remote && job.province === "ON") provinceCounts.on++;
    if (!job.is_remote && job.province === "QC") provinceCounts.qc++;

    if (job.compensation_meta !== null) salaryListedCount++;

    const sourceIndex = sourceIds.indexOf(job.source_id);
    if (sourceIndex >= 0 && sourceIndex < 7) {
      sourceCounts[sourceKeyMap[sourceIndex]]++;
    }

    if (job.work_type === "hybrid") workTypeCounts.hybrid++;
    if (job.work_type === "office") workTypeCounts.office++;
    if (job.work_type === "remote") workTypeCounts.remote++;

    // Calculate dates within a week (exactly matches the database `daysAgo` generator parameter logic)
    if (index % 12 < 7) {
      oneWeekCount++;
    }
  }

  return {
    employmentTypeCounts,
    firstPageCount: Math.min(20, sseJobs.length),
    jobCount: sseJobs.length,
    municipalityCounts,
    oneWeekCount,
    organizationCounts,
    provinceCounts,
    salaryListedCount,
    sampleJobs: {
      nonSseOnly: `Community Builder 26`, // Hardcoded testing anchor boundary
      searchMatch: `Community Builder 25`,
      salarylessVisible: "Community Builder 4",
    },
    secondPageCount: Math.max(0, sseJobs.length - 20),
    sourceCounts,
    sseOffCount: jobs.length,
    workTypeCounts,
  };
})();
