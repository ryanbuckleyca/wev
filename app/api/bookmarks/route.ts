import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import normalizeJobsWithSource from '@/lib/normalize-job'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  try {
    // Create a server client bound to the request cookies to detect the authenticated user
    const serverSupabase = await createServerClient()
    const {
      data: { user },
    } = await serverSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Use admin client to perform a join between jobs and bookmarks for this user
    const adminClient = getSupabaseServer()
    const { data, error } = await adminClient
      .from('jobs')
      .select(
        'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, bookmarks!inner(user_id, created_at)'
      )
      .eq('bookmarks.user_id', user.id)
      .order('date_posted', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Normalize jobs result similar to /api/bulletin
    const jobsWithSource = normalizeJobsWithSource(data)

    return NextResponse.json({ jobs: jobsWithSource })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bookmarked jobs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
