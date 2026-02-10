import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const supabase = getSupabaseServer()
    const { data: scrapeData, error: scrapeError } = await supabase
      .from('scrape_runs')
      .select('run_at')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (scrapeError) {
      return NextResponse.json({ error: scrapeError.message }, { status: 500 })
    }

    const { data: jobsData, error: jobsError } = await supabase
      .from('jobs')
      .select('id, job_title, organization, location, municipality, province, is_remote, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name)')
      .order('date_posted', { ascending: false })

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 })
    }

    const jobsWithSource = (jobsData ?? []).map((job) => {
      const sources = (job as { sources?: { name?: string } | { name?: string }[] }).sources
      const sourceName = Array.isArray(sources) ? sources[0]?.name : sources?.name
      const { sources: _sources, source_id: _sourceId, ...rest } = job as {
        sources?: { name?: string } | { name?: string }[]
        source_id?: string
        [key: string]: unknown
      }
      return {
        ...rest,
        source: sourceName ?? null,
      }
    })

    return NextResponse.json({
      jobs: jobsWithSource,
      lastScrapeTime: scrapeData?.run_at ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
