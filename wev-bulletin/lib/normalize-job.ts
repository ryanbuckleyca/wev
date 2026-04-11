export function normalizeJobsWithSource(
  rows: unknown[] | null | undefined,
): Record<string, unknown>[] {
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
    };
  });
}

export default normalizeJobsWithSource;
