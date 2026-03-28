export function normalizeJobsWithSource(
  rows: unknown[] | null | undefined,
): Record<string, unknown>[] {
  return (rows ?? []).map((job) => {
    const jobRecord = job as Record<string, unknown>;
    const sources = (jobRecord as { sources?: { name?: string } | { name?: string }[] }).sources;
    const sourceName = Array.isArray(sources) ? sources[0]?.name : sources?.name;
    const {
      sources: _sources,
      source_id: _sourceId,
      bookmarks: _bookmarks,
      ...rest
    } = jobRecord as {
      sources?: { name?: string } | { name?: string }[];
      source_id?: string;
      bookmarks?: unknown;
      [key: string]: unknown;
    };
    return {
      ...rest,
      source: sourceName ?? null,
    };
  });
}

export default normalizeJobsWithSource;
