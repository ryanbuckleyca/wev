export function normalizeJobsWithSource(rows: unknown[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map((job: any) => {
    const sources = (job as { sources?: { name?: string } | { name?: string }[] }).sources
    const sourceName = Array.isArray(sources) ? sources[0]?.name : sources?.name
    const { sources: _sources, source_id: _sourceId, bookmarks: _bookmarks, ...rest } = job as {
      sources?: { name?: string } | { name?: string }[]
      source_id?: string
      bookmarks?: any
      [key: string]: unknown
    }
    return {
      ...rest,
      source: sourceName ?? null,
    }
  })
}

export default normalizeJobsWithSource
