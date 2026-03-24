import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import normalizeJobsWithSource from '@/lib/normalize-job'
import { resolveSkillLabels, attachSkillLabels, parseLocale } from '@/lib/resolve-skill-labels'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const locale = parseLocale(searchParams.get('locale'))

    const serverSupabase = await createServerClient()
    const {
      data: { user },
    } = await serverSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const adminClient = getSupabaseServer()
    const { data, error } = await adminClient
      .from('jobs')
      .select(
        'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills, bookmarks!inner(user_id, created_at)'
      )
      .eq('bookmarks.user_id', user.id)
      .order('date_posted', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const jobsWithSource = normalizeJobsWithSource(data)
    const labelMap = await resolveSkillLabels(adminClient, jobsWithSource, locale)
    const jobs = attachSkillLabels(jobsWithSource, labelMap)

    return NextResponse.json({ jobs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bookmarked jobs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
