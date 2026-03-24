import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import normalizeJobsWithSource from '@/lib/normalize-job'
import { resolveSkillLabels, attachSkillLabels, parseLocale } from '@/lib/resolve-skill-labels'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const locale = parseLocale(searchParams.get('locale'))

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
      .select('id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills')
      .order('date_posted', { ascending: false })

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 })
    }

    const jobsWithSource = normalizeJobsWithSource(jobsData)
    const labelMap = await resolveSkillLabels(supabase, jobsWithSource, locale)
    const jobs = attachSkillLabels(jobsWithSource, labelMap)

    return NextResponse.json({
      jobs,
      lastScrapeTime: scrapeData?.run_at ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
