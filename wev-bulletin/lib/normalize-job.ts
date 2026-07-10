export type NormalizedJobRow = Record<string, unknown> & {
  source: string | null;
  organization_id?: number | null;
  organization_slug?: string | null;
};

export function normalizeJobsWithSource(
  rows: unknown[] | null | undefined,
): NormalizedJobRow[] {
  return (rows ?? []).map((job) => {
    const jobRecord = job as Record<string, unknown>;
    const sources = (jobRecord as { sources?: { name?: string } | { name?: string }[] }).sources;
    const sourceName = Array.isArray(sources) ? sources[0]?.name : sources?.name;
    const rest = { ...jobRecord } as Record<string, unknown>;
    delete rest.sources;
    delete rest.source_id;
    delete rest.bookmarks;
    return {
      ...rest,
      source: sourceName ?? null,
    } satisfies NormalizedJobRow;
  });
}

export default normalizeJobsWithSource;
