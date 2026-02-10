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
      .select('id, job_title, organization, location, municipality, province, is_remote, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse')
      .order('date_posted', { ascending: false })

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 })
    }

    return NextResponse.json({
      jobs: jobsData ?? [],
      lastScrapeTime: scrapeData?.run_at ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
